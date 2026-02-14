{ pkgs }:

pkgs.buildNpmPackage rec {
  pname = "pair-review";
  version = "1.4.3";

  src = pkgs.fetchFromGitHub {
    owner = "in-the-loop-labs";
    repo = "pair-review";
    rev = "9c47462547d7497cd559e73cfb8f382c02fb6680";
    hash = "sha256-AFlCvfAWRt3KgVND2TQRZVwG3OIMigme1dCZxWY35cw=";
  };

  npmDepsHash = "sha256-twAWVUo2wNC+7VATJZ+Mwu1PoNIwO8GI4HkIEF8RADE=";

  # No build step needed — it's a plain JS CLI
  dontNpmBuild = true;

  # better-sqlite3 needs python3 + build tools for native addon
  nativeBuildInputs = with pkgs; [ python3 ];

  meta = with pkgs.lib; {
    description = "AI-powered code review partner for AI coding agents";
    homepage = "https://github.com/in-the-loop-labs/pair-review";
    license = licenses.gpl3Only;
    mainProgram = "pair-review";
  };
}
