import XCTest
import Darwin
@testable import CoachCore

/// Ports (TC-P1 to TC-P5), the learner's PATH (TC-T1 to TC-T6) and which release tree (TC-R1 to TC-R3).
final class PortsTests: XCTestCase {
    private let preferred = (app: 3000, agent: 8123)

    /// Hands out the given ports in order.
    private func handing(_ ports: [Int]) -> () -> Int {
        var left = ports
        return { left.removeFirst() }
    }

    func testTCP1BothPreferredPortsFree() {
        let chosen = choosePorts(preferred: preferred, isFree: { _ in true }, anyFree: handing([]))
        XCTAssertEqual([chosen.app, chosen.agent], [3000, 8123])
    }

    func testTCP2TheAppPortBusy() {
        let chosen = choosePorts(preferred: preferred, isFree: { $0 != 3000 }, anyFree: handing([50001]))
        XCTAssertEqual([chosen.app, chosen.agent], [50001, 8123])
    }

    func testTCP3BothBusy() {
        let chosen = choosePorts(preferred: preferred, isFree: { _ in false }, anyFree: handing([50001, 50002]))
        XCTAssertEqual([chosen.app, chosen.agent], [50001, 50002])
    }

    func testTCP4TheTwoAreNeverTheSame() {
        // The app's fallback lands on the agent's preferred port; the agent must not get it too.
        let a = choosePorts(preferred: preferred, isFree: { $0 != 3000 }, anyFree: handing([8123, 50002]))
        XCTAssertEqual([a.app, a.agent], [8123, 50002])
        // The agent's fallback hands back the app's port first.
        let b = choosePorts(preferred: preferred, isFree: { $0 != 8123 }, anyFree: handing([3000, 50003]))
        XCTAssertEqual([b.app, b.agent], [3000, 50003])
    }

    func testTCP5ARealPortHeldOpenIsBusyUntilClosed() throws {
        let port = anyFreePort()
        XCTAssertTrue(portIsFree(port))
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = in_port_t(UInt16(port).bigEndian)
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let bound = withUnsafePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
        XCTAssertEqual(bound, 0)
        XCTAssertEqual(listen(fd, 1), 0)
        XCTAssertFalse(portIsFree(port))
        close(fd)
        XCTAssertTrue(portIsFree(port))
    }
}

final class LoginPathTests: XCTestCase {
    private let fallback = fallbackPath.joined(separator: ":")

    func testTCT1TheShellsPathComesFirstAndTheFallbackFillsTheGaps() {
        var asked: (String, [String])?
        let path = loginPath(shell: "/bin/zsh") { shell, args, _ in asked = (shell, args); return "/x/bin:/usr/bin:/opt/homebrew/bin" }
        let parts = path.split(separator: ":").map(String.init)
        XCTAssertEqual(Array(parts.prefix(3)), ["/x/bin", "/usr/bin", "/opt/homebrew/bin"])
        XCTAssertEqual(Set(parts), Set(["/x/bin"] + fallbackPath))
        XCTAssertEqual(parts.count, Set(parts).count, "no folder twice")
        XCTAssertEqual(asked?.0, "/bin/zsh")
        XCTAssertTrue(asked?.1.contains("-l") ?? false, "a login shell, as Terminal starts")
    }

    func testTCT2NothingPrintedGivesTheFallback() {
        XCTAssertEqual(loginPath(shell: "/bin/zsh") { _, _, _ in "" }, fallback)
    }

    func testTCT3AShellThatFailsOrHangsGivesTheFallback() {
        XCTAssertEqual(loginPath(shell: "/bin/zsh") { _, _, _ in nil }, fallback)
    }

    func testTCT4SpacesAndNewlinesAroundThePathAreDropped() {
        XCTAssertTrue(loginPath(shell: "/bin/zsh") { _, _, _ in "  /x/bin:/usr/bin\n" }.hasPrefix("/x/bin:/usr/bin:"))
    }

    func testTCT4WhatAShellsStartUpFilesPrintIsIgnored() {
        // An interactive shell's start-up files may print; only the marked PATH counts.
        let printed = "Welcome!\n\(pathMarker)/x/bin:/usr/bin\(pathMarker)\nbye"
        XCTAssertTrue(loginPath(shell: "/bin/zsh") { _, _, _ in printed }.hasPrefix("/x/bin:/usr/bin:"))
    }

    func testTCT5NoShellMeansZsh() {
        var asked = ""
        _ = loginPath(shell: nil) { shell, _, _ in asked = shell; return nil }
        XCTAssertEqual(asked, "/bin/zsh")
        _ = loginPath(shell: "") { shell, _, _ in asked = shell; return nil }
        XCTAssertEqual(asked, "/bin/zsh")
    }

    func testTCT6ARealLoginShell() {
        let path = loginPath(shell: "/bin/sh", run: runShell)
        XCTAssertTrue(path.split(separator: ":").contains("/usr/bin"), path)
    }

    func testTCT6AShellThatHangsIsStoppedAtTheTimeout() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("hang-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let shell = folder.appendingPathComponent("hangs")
        try "#!/bin/sh\nsleep 30\n".write(to: shell, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: shell.path)
        let started = Date()
        XCTAssertNil(runShell(shell.path, ["-l", "-c", "true"], 0.5))
        XCTAssertLessThan(Date().timeIntervalSince(started), 5)
    }
}

final class ReleaseTests: XCTestCase {
    private let resources = URL(fileURLWithPath: "/Applications/Local AI Coach.app/Contents/Resources")

    private func present(_ arches: [String]) -> (String) -> Bool {
        { path in arches.contains { path == self.resources.appendingPathComponent("coach-\($0)/bin/local-ai-coach").path } }
    }

    func testTCR1AppleSilicon() {
        XCTAssertEqual(releaseFolder(resources: resources, arch: "arm64", exists: present(["arm64", "x64"]))?.lastPathComponent, "coach-arm64")
    }

    func testTCR2Intel() {
        XCTAssertEqual(releaseFolder(resources: resources, arch: "x64", exists: present(["arm64", "x64"]))?.lastPathComponent, "coach-x64")
    }

    func testTCR3ThisMacsTreeMissing() {
        XCTAssertNil(releaseFolder(resources: resources, arch: "x64", exists: present(["arm64"])))
    }

    func testThisMacsArchitectureIsOneTheBuildMakes() {
        XCTAssertTrue(["arm64", "x64"].contains(currentArch))
    }
}
