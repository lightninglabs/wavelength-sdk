require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "WalletdkReactNative"
  s.version      = package["version"]
  s.summary      = "React Native transport for the WalletDK SDK."
  s.homepage     = "https://github.com/lightninglabs/dawallet"
  s.license      = { :type => "MIT" }
  s.authors      = "Lightning Labs"
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/lightninglabs/dawallet.git" }
  s.source_files = "ios/**/*.{h,mm}"

  # The gomobile-built daemon; staged by scripts/fetch-bindings.sh (gitignored).
  s.vendored_frameworks = "ios/Walletdk.xcframework"

  # The Go runtime's DNS resolver links against libresolv (res_9_* symbols).
  s.libraries = "resolv"

  install_modules_dependencies(s)
end
