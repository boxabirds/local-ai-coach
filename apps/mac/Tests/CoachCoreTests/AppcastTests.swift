import XCTest
@testable import CoachCore

/// Which update list the app reads (Ceetrix story 39, TC-01 to TC-03). The URLs here are made up.
final class AppcastTests: XCTestCase {
    func testTC01NoOverrideReadsTheLatestRelease() {
        XCTAssertEqual(feedURL(environment: [:]), releaseFeed)
        XCTAssertEqual(releaseFeed.scheme, "https")
        XCTAssertTrue(releaseFeed.path.hasSuffix("/releases/latest/download/appcast.xml"), releaseFeed.path)
    }

    func testTC02AnHTTPOrHTTPSOverrideIsUsed() {
        for url in ["http://127.0.0.1:50123/appcast.xml", "https://example.test/feed.xml"] {
            XCTAssertEqual(feedURL(environment: [feedOverrideKey: url]).absoluteString, url)
        }
    }

    func testTC03AnEmptyOrOtherSchemeOverrideIsIgnored() {
        for bad in ["", "   ", "file:///etc/passwd", "ftp://example.test/a.xml", "not a url", "javascript:alert(1)"] {
            XCTAssertEqual(feedURL(environment: [feedOverrideKey: bad]), releaseFeed, bad)
        }
    }
}
