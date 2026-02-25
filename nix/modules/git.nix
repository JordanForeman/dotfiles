{ config, ... }:

{
  # Git configuration for personal/non-Shopify machines
  # On Shopify machines, Dev manages .gitconfig directly
  home.file.".gitconfig".source = ../../.gitconfig;
}
