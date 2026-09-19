# Mobile Apps (Job Tune)

## Cheat sheet

| Framework | Language | Rendering approach | Performance | Learning curve | Native look |
|---|---|---|---|---|---|
| React Native | JS/TS + React | Real native UI components via JSI/TurboModules (New Arch) or async bridge (old) | Near-native | Low (if you know React) | Yes, native by default |
| Flutter | Dart | Self-painted via Skia/Impeller engine, no native widgets | Excellent, most consistent frame timing | Medium (new language) | No — must opt into Cupertino widgets for iOS feel |
| Ionic (Capacitor/Cordova) | HTML/CSS/JS + any framework | Native WebView wrapping a web app | Weakest of the three | Lowest (reuse web app) | No — webby by default |

## Key facts

- **React Native New Architecture**: Fabric (renderer) + TurboModules + JSI (JavaScript Interface) replaces the old async JSON-serializing "bridge" with synchronous JS↔native calls.
- **Flutter** renders every pixel itself — no reliance on OS UI toolkit, which is why it looks identical across platforms.
- **Ionic** uses **Capacitor** (modern, actively developed) or **Cordova** (legacy) to wrap a web app in a native shell and expose native APIs (camera, GPS, biometrics) via plugins.
- Capacitor/Ionic apps are compiled into real store binaries — subject to App Store/Play Store review just like React Native/Flutter apps, unlike a plain PWA.
- List virtualization is critical in React Native: `FlatList`/`FlashList`, never raw `ScrollView`, for long lists.
- Flutter layout = widget tree, everything is a widget (including padding/theme); use `const` constructors to skip unnecessary rebuilds.
- React Native layout = Flexbox only, no CSS Grid, no cascade/inheritance.

## Likely interview questions

**Q: How does React Native actually render native UI from JavaScript?**
A: JS describes a component tree; the reconciler diffs it and issues native UI commands over JSI (or the old bridge) to instantiate real native views (e.g., `UILabel` on iOS, `TextView` on Android).

**Q: Why does Flutter look the same on iOS and Android?**
A: It doesn't use platform UI widgets at all — it draws every pixel itself via its own rendering engine (Skia/Impeller), so there's no OS-level styling difference unless you deliberately use Cupertino widgets.

**Q: What's the performance tradeoff of Ionic vs. React Native/Flutter?**
A: Ionic runs in a WebView — slower cold start, and any deeply custom/animation-heavy native interaction is harder to achieve smoothly compared to compiled-native (RN) or self-rendered (Flutter) approaches.

**Q: What problem did the React Native "New Architecture" solve?**
A: The old bridge was async and serialized all JS↔native communication to JSON, causing latency for high-frequency interactions (e.g., gesture-driven animations). JSI allows direct, synchronous calls, removing that bottleneck.

**Q: When would you choose Ionic over React Native?**
A: When you already have a substantial web app/codebase and want the fastest path to an installable app without a rewrite, and near-native performance isn't a hard requirement.

**Q: What's the biggest CSS-knowledge trap moving into React Native?**
A: Assuming full CSS support — RN only supports Flexbox for layout, no Grid, no cascading inheritance, and only a style-object subset of CSS properties.

---

**Where this fits:** Between PWAs and Desktop Apps in the roadmap.
