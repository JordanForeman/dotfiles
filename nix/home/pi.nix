{ config, pkgs, lib, ... }:

{
  # Pi harness customization (versioned via dotfiles)
  #
  # NOTE: We intentionally do NOT manage the entire ~/.pi/agent directory, because
  # Pi stores machine-local state there (auth.json, sessions/). Instead we manage
  # only the specific files/directories we want synced.

  home.file.".pi/agent/AGENTS.md".source = ../../pi/agent/AGENTS.md;
  home.file.".pi/agent/settings.json".source = ../../pi/agent/settings.json;
  home.file.".pi/agent/keybindings.json".source = ../../pi/agent/keybindings.json;

  home.file.".pi/agent/extensions" = {
    source = ../../pi/agent/extensions;
    recursive = true;
  };

  home.file.".pi/agent/prompts" = {
    source = ../../pi/agent/prompts;
    recursive = true;
  };

  home.file.".pi/agent/skills" = {
    source = ../../pi/agent/skills;
    recursive = true;
  };

  home.file.".pi/agent/themes" = {
    source = ../../pi/agent/themes;
    recursive = true;
  };
}
