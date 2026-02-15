class Auxiora < Formula
  desc "Self-hosted AI assistant"
  homepage "https://github.com/auxiora/auxiora"
  version "VERSION_PLACEHOLDER"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/auxiora/auxiora/releases/download/v#{version}/auxiora-#{version}-darwin-arm64.tar.gz"
      sha256 "SHA256_PLACEHOLDER_DARWIN_ARM64"
    else
      url "https://github.com/auxiora/auxiora/releases/download/v#{version}/auxiora-#{version}-darwin-x64.tar.gz"
      sha256 "SHA256_PLACEHOLDER_DARWIN_X64"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/auxiora/auxiora/releases/download/v#{version}/auxiora-#{version}-linux-arm64.tar.gz"
      sha256 "SHA256_PLACEHOLDER_LINUX_ARM64"
    else
      url "https://github.com/auxiora/auxiora/releases/download/v#{version}/auxiora-#{version}-linux-x64.tar.gz"
      sha256 "SHA256_PLACEHOLDER_LINUX_X64"
    end
  end

  depends_on "node@22"

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"bin/auxiora"
  end

  test do
    assert_match "auxiora", shell_output("#{bin}/auxiora --version")
  end
end
