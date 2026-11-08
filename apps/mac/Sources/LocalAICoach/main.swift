import AppKit

// Local AI Coach.app (Ceetrix story 35). `--no-open` starts the coach without opening the
// browser, as the release's launcher does; the release test uses it.
let noOpen = "--no-open"
let app = NSApplication.shared
let delegate = AppDelegate(openBrowser: !CommandLine.arguments.contains(noOpen))
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
