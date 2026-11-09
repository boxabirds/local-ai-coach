import AppKit
import CoachCore
import CoachIcon

/// What the app says, in the coach's voice (assets/tone-of-voice-guide.md).
enum Words {
    static let starting = "Starting the coach"
    static let stoppedStatus = "The coach isn't running"
    static let openCoach = "Open coach"
    static let openLogs = "Open logs"
    static let checkForUpdates = "Check for updates\u{2026}"
    static let quit = "Quit Local AI Coach"
    static let couldNotStart = "I couldn't start."
    static let stoppedUnexpectedly = "I stopped unexpectedly."
    static let notInThisDownload = "This Mac's version of me isn't in this download."
    static let endOfLog = "The end of my log:"
    static let quitButton = "Quit"
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    /// How long Quit waits for the coach to stop before it is killed.
    static let stopWait: TimeInterval = 10
    static let homeFolder = ".local-ai-coach"
    static let logsFolder = "logs"
    static let quitKey = "q"

    private let openBrowser: Bool
    private var item: NSStatusItem!
    private let statusLine = NSMenuItem(title: Words.starting, action: nil, keyEquivalent: "")
    private let openItem = NSMenuItem(title: Words.openCoach, action: #selector(openCoach), keyEquivalent: "")
    private let updateItem = NSMenuItem(title: Words.checkForUpdates, action: #selector(checkForUpdates), keyEquivalent: "")
    private var updates: Updates!
    /// The running coach, and whether a quit has begun; read from the main thread, the
    /// start-up thread and the signal handler, so behind a lock.
    private let lock = NSLock()
    private var coach: Coach?
    private var quitting = false
    private var address: URL?
    private var opened = false
    private var signals: [DispatchSourceSignal] = []

    init(openBrowser: Bool) {
        self.openBrowser = openBrowser
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = CoachIcon.menuBarImage()
        item.button?.setAccessibilityLabel("Local AI Coach")
        updates = Updates(relaunch: openBrowser)
        let menu = NSMenu()
        menu.autoenablesItems = false
        menu.delegate = self
        updateItem.target = self
        statusLine.isEnabled = false
        openItem.target = self
        openItem.isEnabled = false
        let logs = NSMenuItem(title: Words.openLogs, action: #selector(openLogs), keyEquivalent: "")
        logs.target = self
        let quit = NSMenuItem(title: Words.quit, action: #selector(NSApplication.terminate(_:)), keyEquivalent: Self.quitKey)
        [statusLine, openItem, logs, updateItem, .separator(), quit].forEach { menu.addItem($0) }
        item.menu = menu

        // A kill or Ctrl-C stops the coach and exits without AppKit, which may be inside an
        // alert's modal loop and not run anything sent to the main queue until it closes.
        for number in [SIGTERM, SIGINT] {
            signal(number, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: number, queue: .global(qos: .userInitiated))
            source.setEventHandler { [self] in
                takeCoach()?.stop(wait: Self.stopWait)
                exit(0)
            }
            source.resume()
            signals.append(source)
        }

        DispatchQueue.global(qos: .userInitiated).async { self.start() }
    }

    private func start() {
        guard let resources = Bundle.main.resourceURL, let release = releaseFolder(resources: resources, arch: currentArch) else {
            DispatchQueue.main.async { self.show(.failed(Words.notInThisDownload)) }
            return
        }
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = loginPath(shell: Self.shell(), run: runShell)
        let ports = choosePorts(preferred: preferredPorts, isFree: portIsFree, anyFree: anyFreePort)
        environment["COACH_APP_PORT"] = String(ports.app)
        environment["COACH_AGENT_PORT"] = String(ports.agent)
        let coach = Coach(launcher: release.appendingPathComponent(launcherPath), environment: environment, onLine: { line in
            // Passed on, so whoever started the app (the release test) can read it.
            FileHandle.standardOutput.write(Data((line + "\n").utf8))
        }, onChange: { state in
            DispatchQueue.main.async { self.show(state) }
        })
        let go: Bool = lock.withLock {
            if quitting { return false }
            self.coach = coach
            return true
        }
        if go { coach.start() }
    }

    /// The learner's login shell: $SHELL, else their account's.
    private static func shell() -> String? {
        if let shell = ProcessInfo.processInfo.environment["SHELL"], !shell.isEmpty { return shell }
        guard let entry = getpwuid(getuid()), let shell = entry.pointee.pw_shell else { return nil }
        return String(cString: shell)
    }

    private func show(_ state: CoachState) {
        switch state {
        case .starting:
            statusLine.title = Words.starting
            statusLine.isHidden = false
            openItem.isEnabled = false
        case .running(let url):
            address = url
            statusLine.isHidden = true
            openItem.isEnabled = true
            if openBrowser && !opened {
                opened = true
                NSWorkspace.shared.open(url)
            }
        case .failed(let tail):
            alert(Words.couldNotStart, tail)
        case .stopped(let tail):
            address = nil
            alert(Words.stoppedUnexpectedly, tail)
        case .quitting:
            openItem.isEnabled = false
        }
    }

    private func alert(_ title: String, _ tail: String) {
        statusLine.title = Words.stoppedStatus
        statusLine.isHidden = false
        openItem.isEnabled = false
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = title
        alert.informativeText = tail == Words.notInThisDownload ? tail : "\(Words.endOfLog)\n\n\(tail)"
        alert.addButton(withTitle: Words.openLogs)
        alert.addButton(withTitle: Words.quitButton)
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn { openLogs() }
        NSApp.terminate(nil)
    }

    @objc private func openCoach() {
        if let address { NSWorkspace.shared.open(address) }
    }

    /// The menu item and the AppleScript command `check for updates` (story 39).
    @objc func checkForUpdates() {
        updates.check()
    }

    /// Check for updates is off while a check is already running.
    func menuWillOpen(_ menu: NSMenu) {
        updateItem.isEnabled = updates.canCheck()
    }

    @objc private func openLogs() {
        let home = ProcessInfo.processInfo.environment["COACH_HOME"].map { URL(fileURLWithPath: $0) }
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(Self.homeFolder)
        let logs = home.appendingPathComponent(Self.logsFolder)
        NSWorkspace.shared.open(FileManager.default.fileExists(atPath: logs.path) ? logs : home)
    }

    /// Double-clicking the app while it runs opens the coach instead of starting another.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        openCoach()
        return false
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let coach = takeCoach() else { return .terminateNow }
        DispatchQueue.global(qos: .userInitiated).async {
            coach.stop(wait: Self.stopWait)
            // While a reply is awaited AppKit runs the main run loop in the modal panel mode,
            // where blocks sent with DispatchQueue.main never run.
            RunLoop.main.perform(inModes: [.common, .modalPanel]) { NSApp.reply(toApplicationShouldTerminate: true) }
            CFRunLoopWakeUp(CFRunLoopGetMain())
        }
        return .terminateLater
    }

    /// Marks the quit and hands over the coach, once: whoever quits first stops it.
    private func takeCoach() -> Coach? {
        lock.withLock {
            quitting = true
            defer { coach = nil }
            return coach
        }
    }
}
