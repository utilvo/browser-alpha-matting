// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "BrowserAlphaMatting",
    platforms: [
        .macOS(.v12),
        .iOS(.v15),
        .tvOS(.v15),
        .watchOS(.v8)
    ],
    products: [
        .library(
            name: "BrowserAlphaMatting",
            targets: ["BrowserAlphaMatting"]
        ),
    ],
    targets: [
        .target(
            name: "BrowserAlphaMatting",
            path: "Sources/BrowserAlphaMatting"
        ),
    ]
)
