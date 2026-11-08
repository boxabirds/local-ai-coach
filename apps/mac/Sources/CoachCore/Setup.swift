import Darwin
import Foundation

// ------------------------------------------------------------------ ports (mac.ports)

/// The Terminal install's defaults, so the address and bookmarks stay the same when free.
public let preferredPorts = (app: 3000, agent: 8123)

/// Each preferred port if free, else a free one; never the same port twice.
public func choosePorts(preferred: (app: Int, agent: Int), isFree: (Int) -> Bool, anyFree: () -> Int) -> (app: Int, agent: Int) {
    let app = isFree(preferred.app) ? preferred.app : anyFree()
    var agent = preferred.agent != app && isFree(preferred.agent) ? preferred.agent : anyFree()
    while agent == app { agent = anyFree() }
    return (app, agent)
}

private func loopbackSocket(_ port: Int) -> (fd: Int32, bound: Bool) {
    let fd = socket(AF_INET, SOCK_STREAM, 0)
    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = in_port_t(UInt16(port).bigEndian)
    address.sin_addr.s_addr = inet_addr(Coach.loopback)
    let result = withUnsafePointer(to: &address) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
    }
    return (fd, result == 0)
}

/// Nothing holds this port on 127.0.0.1 (no SO_REUSEADDR, so one still closing counts as held).
public func portIsFree(_ port: Int) -> Bool {
    let (fd, bound) = loopbackSocket(port)
    close(fd)
    return bound
}

/// A port the system says is free on 127.0.0.1 now.
public func anyFreePort() -> Int {
    let (fd, bound) = loopbackSocket(0)
    defer { close(fd) }
    precondition(bound, "no free port on 127.0.0.1")
    var address = sockaddr_in()
    var size = socklen_t(MemoryLayout<sockaddr_in>.size)
    _ = withUnsafeMutablePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &size) } }
    return Int(UInt16(bigEndian: address.sin_port))
}

// ------------------------------------------------------------------ the learner's PATH (mac.path)

/// Folders a Terminal on a Mac usually has, added when the login shell doesn't give them.
/// An app opened from Finder gets only /usr/bin:/bin:/usr/sbin:/sbin.
public let fallbackPath = ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
public let defaultShell = "/bin/zsh"
/// Marks the PATH in the shell's output, so whatever its start-up files print is ignored.
public let pathMarker = "__LOCAL_AI_COACH_PATH__"
public let shellTimeout: TimeInterval = 5

/// The PATH the learner's Terminal has: their login shell's, then the usual folders it lacks.
public func loginPath(shell: String?, run: (String, [String], TimeInterval) -> String?) -> String {
    let chosen = (shell?.isEmpty ?? true) ? defaultShell : shell!
    // Interactive and login, as Terminal starts it, so both .zprofile and .zshrc count.
    let printed = run(chosen, ["-i", "-l", "-c", "printf '\(pathMarker)%s\(pathMarker)' \"$PATH\""], shellTimeout) ?? ""
    var text = printed
    let parts = printed.components(separatedBy: pathMarker)
    if parts.count >= 3 { text = parts[1] }
    var seen = Set<String>()
    var folders: [String] = []
    for folder in text.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: ":").map(String.init) + fallbackPath where !folder.isEmpty && seen.insert(folder).inserted {
        folders.append(folder)
    }
    return folders.joined(separator: ":")
}

/// Runs a shell with the app's environment; its output, or nil if it failed or took longer than `timeout`.
public func runShell(_ shell: String, _ arguments: [String], _ timeout: TimeInterval) -> String? {
    var environment = ProcessInfo.processInfo.environment
    environment["TERM"] = "dumb"
    guard let child = try? spawn(shell, arguments, environment: environment) else { return nil }
    let done = DispatchSemaphore(value: 0)
    var output = Data()
    Thread.detachNewThread {
        var buffer = [UInt8](repeating: 0, count: Coach.readSize)
        while true {
            let count = read(child.output, &buffer, buffer.count)
            if count < 0 && errno == EINTR { continue }
            if count <= 0 { break }
            output.append(contentsOf: buffer[0 ..< count])
        }
        done.signal()
    }
    var status: Int32 = 0
    let exited = DispatchSemaphore(value: 0)
    Thread.detachNewThread { status = waitFor(child.pid); exited.signal() }
    if exited.wait(timeout: .now() + timeout) == .timedOut {
        for each in descendants(of: child.pid).reversed() { kill(each, SIGKILL) }
        kill(-child.pid, SIGKILL)
        exited.wait()
        close(child.output)
        return nil
    }
    _ = done.wait(timeout: .now() + Coach.drainWait)
    close(child.output)
    // WIFEXITED and WEXITSTATUS, which Swift does not import.
    let exitedNormally = status & 0x7f == 0
    guard exitedNormally, (status >> 8) & 0xff == 0 else { return nil }
    return String(decoding: output, as: UTF8.self)
}

// ------------------------------------------------------------------ which release tree (mac.bundle)

public let launcherPath = "bin/local-ai-coach"
public let releasePrefix = "coach-"

/// This Mac's architecture, as the release names it.
public var currentArch: String {
    #if arch(arm64)
    return "arm64"
    #else
    return "x64"
    #endif
}

/// The release tree for `arch` inside the app's Resources, if its launcher is there.
public func releaseFolder(resources: URL, arch: String, exists: (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }) -> URL? {
    let folder = resources.appendingPathComponent(releasePrefix + arch)
    return exists(folder.appendingPathComponent(launcherPath).path) ? folder : nil
}
