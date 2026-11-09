import Foundation

// Which update list the app reads (Ceetrix story 39). Every release uploads its appcast.xml next to
// the disk image, and GitHub's latest/download path always names the newest release's copy.

/// The newest release's update list.
public let releaseFeed = URL(string: "https://github.com/boxabirds/local-ai-coach/releases/latest/download/appcast.xml")!

/// Points the app at another update list; the release test serves one on 127.0.0.1. Safe to honour
/// in the shipped app: Sparkle still installs only what is signed with the key in Info.plist.
public let feedOverrideKey = "COACH_UPDATE_FEED"

private let feedSchemes: Set<String> = ["http", "https"]

/// The override when it is an http or https URL with a host, otherwise the release feed.
public func feedURL(environment: [String: String]) -> URL {
    let value = environment[feedOverrideKey]?.trimmingCharacters(in: .whitespaces) ?? ""
    guard let url = URL(string: value), let scheme = url.scheme?.lowercased(), feedSchemes.contains(scheme),
          let host = url.host, !host.isEmpty else { return releaseFeed }
    return url
}
