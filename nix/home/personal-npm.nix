{ config, lib, pkgs, ... }:

let
  homeDir = config.home.homeDirectory;
in
{
  home.sessionVariables = {
    NPM_CONFIG_CACHE = "${homeDir}/.npm-global/cache";
  };

  home.file.".npmrc".text = ''
    prefix=${homeDir}/.npm-global
    cache=${homeDir}/.npm-global/cache
    fund=false
    audit=false
  '';

  home.activation.ensureNpmCacheDir = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    ${pkgs.coreutils}/bin/mkdir -p "${homeDir}/.npm-global/cache"
  '';
}
