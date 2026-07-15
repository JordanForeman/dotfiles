{ pkgs }:

let
  inherit (pkgs) lib stdenvNoCC;

  version = "0.7.4";
  system = stdenvNoCC.hostPlatform.system;
  assets = {
    x86_64-linux = {
      name = "herdr-linux-x86_64";
      hash = "sha256-vA/ALUulAPnKwjU6Q+Z/4DZ4Xsym61U3jgUPrDwQMFk=";
    };
    aarch64-linux = {
      name = "herdr-linux-aarch64";
      hash = "sha256-VE4AAt5CgG0atkzN7zp+dBTyRxewtrAivJ5X0u79JqI=";
    };
    x86_64-darwin = {
      name = "herdr-macos-x86_64";
      hash = "sha256-3fQwEzNS4XEkE9XYZbNKSFVG9GWIk/yJmGJX1lp1hag=";
    };
    aarch64-darwin = {
      name = "herdr-macos-aarch64";
      hash = "sha256-JJkuFiXb3LGDVKWeKZ5LJjwxJACzE5bNwHzUbtV/JKc=";
    };
  };
  asset = assets.${system} or (throw "herdr is not packaged for ${system}");
in
stdenvNoCC.mkDerivation {
  pname = "herdr";
  inherit version;

  src = pkgs.fetchurl {
    url = "https://github.com/ogulcancelik/herdr/releases/download/v${version}/${asset.name}";
    inherit (asset) hash;
  };

  dontUnpack = true;

  installPhase = ''
    install -Dm755 "$src" "$out/bin/herdr"
  '';

  meta = {
    description = "Agent session multiplexer";
    homepage = "https://herdr.dev/";
    license = lib.licenses.mit;
    platforms = builtins.attrNames assets;
    mainProgram = "herdr";
  };
}
