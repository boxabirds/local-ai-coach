import Darwin
import Foundation

/// Where the coach is, as the app shows it (story 35, mac.lifecycle).
public enum CoachState: Equatable, Sendable {
    case starting
    case running(URL)
    /// It exited before it was ready, or could not be run; the end of its output.
    case failed(String)
    /// It exited by itself after it was ready; the end of its output.
    case stopped(String)
    case quitting
}

/// Runs the release's own launcher (`bin/local-ai-coach --no-open`), which starts the agent and
/// the page on 127.0.0.1 and stops both when it gets SIGTERM. This class only watches it.
public final class Coach: @unchecked Sendable {
    /// The launcher prints this, then the address, once both parts answer.
    public static let readyPrefix = "The coach is running at "
    /// How much of the launcher's output an alert shows.
    public static let tailLines = 15
    static let launcherArguments = ["--no-open"]
    static let loopback = "127.0.0.1"
    static let readyScheme = "http"
    /// How long to wait for the output's last lines once the launcher has exited.
    static let drainWait: TimeInterval = 1
    static let readSize = 4096

    private let launcher: URL
    private let environment: [String: String]
    private let onLine: (String) -> Void
    private let onChange: (CoachState) -> Void
    private let lock = NSLock()
    private var current: CoachState?
    private var pid: pid_t = 0
    private var lines: [String] = []
    private let exited = DispatchSemaphore(value: 0)
    private let drained = DispatchSemaphore(value: 0)

    public init(launcher: URL, environment: [String: String], onLine: @escaping (String) -> Void = { _ in }, onChange: @escaping (CoachState) -> Void) {
        self.launcher = launcher
        self.environment = environment
        self.onLine = onLine
        self.onChange = onChange
    }

    public var state: CoachState? { lock.withLock { current } }

    public func start() {
        set(.starting)
        let child: Spawned
        do {
            child = try spawn(launcher.path, Self.launcherArguments, environment: environment)
        } catch {
            set(.failed(String(describing: error)))
            return
        }
        lock.withLock { pid = child.pid }
        Thread.detachNewThread { [self] in read(child.output) }
        Thread.detachNewThread { [self] in
            _ = waitFor(child.pid)
            exited.signal()
            _ = drained.wait(timeout: .now() + Self.drainWait)
            let tail = lock.withLock { lines.suffix(Self.tailLines).joined(separator: "\n") }
            switch state {
            case .starting?: set(.failed(tail))
            case .running?: set(.stopped(tail))
            default: break
            }
        }
    }

    /// Asks the launcher to stop (SIGTERM); after `wait` seconds kills it and everything it
    /// started. Returns once it has exited. A quit is never reported as a failure.
    public func stop(wait: TimeInterval) {
        let target: pid_t = lock.withLock {
            current = .quitting
            return pid
        }
        onChange(.quitting)
        guard target > 0 else { return }
        kill(target, SIGTERM)
        if exited.wait(timeout: .now() + wait) == .timedOut {
            for each in descendants(of: target).reversed() { kill(each, SIGKILL) }
            kill(-target, SIGKILL)
            exited.wait()
        }
        exited.signal() // for any later caller
    }

    private func set(_ state: CoachState) {
        let changed: Bool = lock.withLock {
            if current == .quitting { return false }
            current = state
            return true
        }
        if changed { onChange(state) }
    }

    private func read(_ fd: Int32) {
        defer { close(fd); drained.signal() }
        var pending = Data()
        var buffer = [UInt8](repeating: 0, count: Self.readSize)
        while true {
            let count = Darwin.read(fd, &buffer, buffer.count)
            if count < 0 && errno == EINTR { continue }
            if count <= 0 { break }
            pending.append(contentsOf: buffer[0 ..< count])
            while let newline = pending.firstIndex(of: UInt8(ascii: "\n")) {
                line(String(decoding: pending[pending.startIndex ..< newline], as: UTF8.self))
                pending.removeSubrange(pending.startIndex ... newline)
            }
        }
        if !pending.isEmpty { line(String(decoding: pending, as: UTF8.self)) }
    }

    private func line(_ text: String) {
        lock.withLock { lines.append(text) }
        onLine(text)
        if case .starting? = state, let url = Self.readyAddress(text) { set(.running(url)) }
    }

    /// The address in a ready line, only if it is plain http on this computer's own address.
    static func readyAddress(_ line: String) -> URL? {
        guard line.hasPrefix(readyPrefix) else { return nil }
        let text = line.dropFirst(readyPrefix.count).trimmingCharacters(in: .whitespaces)
        guard let url = URL(string: text), url.scheme == readyScheme, url.host == loopback, url.port != nil else { return nil }
        return url
    }
}
