import XCTest
@testable import CoachCore

/// The launcher's lifecycle (story 35, TC-L1 to TC-L9). Each fake launcher is a real bash
/// script, so spawning, output, exit codes, signals and child processes are all real.
final class CoachTests: XCTestCase {
    private var folder: URL!
    private let wait: TimeInterval = 10

    override func setUpWithError() throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("coach-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: folder)
    }

    /// A fake launcher. $PIDFILE gets the pids of anything it leaves running.
    private func launcher(_ body: String) throws -> URL {
        let url = folder.appendingPathComponent("local-ai-coach")
        try "#!/bin/bash\n\(body)\n".write(to: url, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.path)
        return url
    }

    private var pidFile: String { folder.appendingPathComponent("pids").path }

    private final class Recorder: @unchecked Sendable {
        private let lock = NSLock()
        private var seen: [CoachState] = []
        var states: [CoachState] { lock.lock(); defer { lock.unlock() }; return seen }
        func add(_ state: CoachState) { lock.lock(); seen.append(state); lock.unlock() }
    }

    private func coach(_ url: URL, _ recorder: Recorder) -> Coach {
        Coach(launcher: url, environment: ["PATH": "/usr/bin:/bin", "PIDFILE": pidFile]) { recorder.add($0) }
    }

    private func until(_ timeout: TimeInterval = 10, _ condition: () -> Bool) {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition() && Date() < deadline { usleep(20_000) }
    }

    private func alive(_ pid: pid_t) -> Bool { kill(pid, 0) == 0 }

    private func leftPids() -> [pid_t] {
        ((try? String(contentsOfFile: pidFile, encoding: .utf8)) ?? "").split(whereSeparator: \.isNewline).compactMap { pid_t($0) }
    }

    private func isFinal(_ state: CoachState?) -> Bool {
        switch state { case .failed, .stopped: return true; default: return false }
    }

    func testTCL1ReadyLineMeansRunningAtThatAddress() throws {
        let r = Recorder()
        let c = coach(try launcher("echo 'Starting the coach'\necho 'The coach is running at http://127.0.0.1:3456'\nsleep 30"), r)
        c.start()
        until { r.states.count >= 2 }
        XCTAssertEqual(r.states, [.starting, .running(URL(string: "http://127.0.0.1:3456")!)])
        c.stop(wait: wait)
    }

    func testTCL1TheLauncherIsAskedNotToOpenTheBrowser() throws {
        let r = Recorder()
        let args = folder.appendingPathComponent("args").path
        let c = coach(try launcher("echo \"$@\" > '\(args)'\necho 'The coach is running at http://127.0.0.1:3456'\nsleep 30"), r)
        c.start()
        until { r.states.count >= 2 }
        XCTAssertEqual(try String(contentsOfFile: args, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines), "--no-open")
        c.stop(wait: wait)
    }

    func testTCL2ExitBeforeReadyFailsWithTheLastFifteenLines() throws {
        let r = Recorder()
        let c = coach(try launcher("for i in $(seq 1 20); do echo \"line $i\"; done\nexit 1"), r)
        c.start()
        until { isFinal(r.states.last) }
        guard case .failed(let tail)? = r.states.last else { return XCTFail("\(r.states)") }
        XCTAssertEqual(tail.split(separator: "\n").map(String.init), (6...20).map { "line \($0)" })
        XCTAssertEqual(Coach.tailLines, 15)
    }

    func testTCL3ExitAfterReadyIsStopped() throws {
        let r = Recorder()
        let c = coach(try launcher("echo 'The coach is running at http://127.0.0.1:3456'\nsleep 0.3\necho 'it broke'\nexit 1"), r)
        c.start()
        until { isFinal(r.states.last) }
        XCTAssertEqual(r.states.count, 3, "\(r.states)")
        guard case .stopped(let tail)? = r.states.last else { return XCTFail("\(r.states)") }
        XCTAssertTrue(tail.hasSuffix("it broke"), tail)
    }

    func testTCL4ALauncherThatIsNotThereFailsAndStartsNothing() {
        let r = Recorder()
        let c = coach(folder.appendingPathComponent("missing"), r)
        c.start()
        until { isFinal(r.states.last) }
        guard case .failed(let reason)? = r.states.last else { return XCTFail("\(r.states)") }
        XCTAssertFalse(reason.isEmpty)
    }

    func testTCL5QuitWhileRunningStopsTheLauncherAndWhatItStarted() throws {
        let r = Recorder()
        let c = coach(try launcher("""
        sleep 300 &
        child=$!
        echo $child >> "$PIDFILE"
        trap 'kill $child; exit 0' TERM
        echo 'The coach is running at http://127.0.0.1:3456'
        wait
        """), r)
        c.start()
        until { r.states.count >= 2 }
        let child = try XCTUnwrap(leftPids().first)
        XCTAssertTrue(alive(child))
        c.stop(wait: wait)
        until { !alive(child) }
        XCTAssertFalse(alive(child))
        XCTAssertEqual(r.states.last, .quitting, "a quit is not reported as stopping unexpectedly")
    }

    func testTCL6ALauncherThatIgnoresQuitIsKilledWithEverythingItStarted() throws {
        let r = Recorder()
        let c = coach(try launcher("""
        trap '' TERM
        sleep 300 &
        echo $! >> "$PIDFILE"
        echo 'The coach is running at http://127.0.0.1:3456'
        while true; do sleep 1; done
        """), r)
        c.start()
        until { r.states.count >= 2 }
        let child = try XCTUnwrap(leftPids().first)
        let started = Date()
        c.stop(wait: 1)
        until { !alive(child) }
        XCTAssertFalse(alive(child))
        XCTAssertLessThan(Date().timeIntervalSince(started), wait)
        XCTAssertEqual(r.states.last, .quitting)
    }

    func testTCL7QuitWhileStartingRaisesNoFailure() throws {
        let r = Recorder()
        let c = coach(try launcher("echo 'Starting the coach'\nsleep 300"), r)
        c.start()
        until { r.states.count >= 1 }
        usleep(200_000)
        c.stop(wait: wait)
        usleep(300_000)
        XCTAssertEqual(r.states, [.starting, .quitting])
    }

    func testTCL8AReadyLineForAnAddressOffThisComputerIsIgnored() throws {
        let r = Recorder()
        let c = coach(try launcher("echo 'The coach is running at http://0.0.0.0:3456'\necho 'The coach is running at https://127.0.0.1:3456'\necho 'The coach is running at http://example.test:3456'\nsleep 1\nexit 1"), r)
        c.start()
        until { isFinal(r.states.last) }
        XCTAssertFalse(r.states.contains { if case .running = $0 { return true } else { return false } }, "\(r.states)")
    }

    func testTCL9LinesWrittenInPiecesAreJoinedAndALastLineWithNoNewlineIsKept() throws {
        let r = Recorder()
        let c = coach(try launcher("printf 'The coach is run'\nsleep 0.2\nprintf 'ning at http://127.0.0.1:3456\\n'\nsleep 0.2\nprintf 'no newline at the end'\nexit 1"), r)
        c.start()
        until { isFinal(r.states.last) }
        XCTAssertEqual(r.states.dropLast(), [.starting, .running(URL(string: "http://127.0.0.1:3456")!)])
        guard case .stopped(let tail)? = r.states.last else { return XCTFail("\(r.states)") }
        XCTAssertTrue(tail.hasSuffix("no newline at the end"), tail)
    }

    func testEveryLineIsPassedOn() throws {
        let r = Recorder()
        let lines = Recorder2()
        let c = Coach(launcher: try launcher("echo one\necho two\nexit 1"), environment: ["PATH": "/usr/bin:/bin"], onLine: { lines.add($0) }) { r.add($0) }
        c.start()
        until { isFinal(r.states.last) }
        XCTAssertEqual(lines.all, ["one", "two"])
    }

    func testTheEnvironmentIsTheOneGivenAndNothingElse() throws {
        let r = Recorder()
        let out = folder.appendingPathComponent("env").path
        let c = Coach(launcher: try launcher("env > '\(out)'\nexit 1"), environment: ["PATH": "/usr/bin:/bin", "COACH_APP_PORT": "4567"]) { r.add($0) }
        c.start()
        until { isFinal(r.states.last) }
        let env = try String(contentsOfFile: out, encoding: .utf8)
        XCTAssertTrue(env.contains("COACH_APP_PORT=4567"))
        XCTAssertFalse(env.contains("XCTest"), "the test runner's environment leaked into the launcher")
    }
}

final class Recorder2: @unchecked Sendable {
    private let lock = NSLock()
    private var lines: [String] = []
    var all: [String] { lock.lock(); defer { lock.unlock() }; return lines }
    func add(_ line: String) { lock.lock(); lines.append(line); lock.unlock() }
}
