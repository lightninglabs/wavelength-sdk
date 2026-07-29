require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "WavelengthReactNative"
  s.version      = package["version"]
  s.summary      = "React Native transport for the Wavelength SDK."
  s.homepage     = "https://github.com/lightninglabs/wavelength-sdk"
  s.license      = { :type => "MIT" }
  s.authors      = "Lightning Labs"
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/lightninglabs/wavelength-sdk.git" }
  s.source_files = "ios/**/*.{h,mm,swift}"
  s.pod_target_xcconfig = { "DEFINES_MODULE" => "YES" }

  # The gomobile-built daemon. Not shipped in the npm package and gitignored
  # here, so it must be staged before `pod install`; the package README has the
  # steps, and a wavelength-sdk checkout can run scripts/fetch-bindings.sh.
  s.vendored_frameworks = "ios/Wavewalletdk.xcframework"

  # The Go runtime's DNS resolver links against libresolv (res_9_* symbols).
  s.libraries = "resolv"

  install_modules_dependencies(s)
end
