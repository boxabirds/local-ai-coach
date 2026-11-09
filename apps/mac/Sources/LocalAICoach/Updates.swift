import AppKit
import CoachCore
import Sparkle

/// The updater (Ceetrix story 39). Sparkle checks once a day (Info.plist), shows its own windows,
/// and installs only what is signed with the key in Info.plist. The menu item and the AppleScript
/// command both call `check()`.
final class Updates: NSObject, SPUUpdaterDelegate {
    /// What the app prints for whoever started it (the release test reads these).
    enum Line {
        static let found = "update found "
        static let upToDate = "up to date"
    }

    /// An app started with --no-open was started by something else (the release test, a script);
    /// Sparkle's relaunch would drop that flag, so whoever started it starts it again.
    private let relaunch: Bool
    private var controller: SPUStandardUpdaterController!

    init(relaunch: Bool) {
        self.relaunch = relaunch
        super.init()
        controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: self, userDriverDelegate: nil)
    }

    func check() {
        controller.checkForUpdates(nil)
    }

    func canCheck() -> Bool { controller.updater.canCheckForUpdates }

    // MARK: SPUUpdaterDelegate

    func feedURLString(for updater: SPUUpdater) -> String? {
        feedURL(environment: ProcessInfo.processInfo.environment).absoluteString
    }

    func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
        say(Line.found + item.displayVersionString)
    }

    func updaterDidNotFindUpdate(_ updater: SPUUpdater) {
        say(Line.upToDate)
    }

    func updaterShouldRelaunchApplication(_ updater: SPUUpdater) -> Bool { relaunch }

    private func say(_ line: String) {
        FileHandle.standardOutput.write(Data((line + "\n").utf8))
    }
}

/// `check for updates` (LocalAICoach.sdef): the same check as the menu item.
@objc(CheckForUpdatesCommand)
final class CheckForUpdatesCommand: NSScriptCommand {
    override func performDefaultImplementation() -> Any? {
        DispatchQueue.main.async { (NSApp.delegate as? AppDelegate)?.checkForUpdates() }
        return nil
    }
}
