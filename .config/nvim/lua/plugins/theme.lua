-- Omarchy theme plugin spec
--
-- On Omarchy, this file is usually symlinked from:
--   ~/.config/omarchy/current/theme/neovim.lua
--
-- In this dotfiles repo we keep a copy so macOS can use the same Neovim setup
-- without depending on Omarchy's theme switcher.

return {
  {
    "uloco/bluloco.nvim",
    lazy = false,
    priority = 1000,
    dependencies = { "rktjmp/lush.nvim" },
    config = function()
      -- optional theme config can go here
    end,
  },

  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "bluloco-dark",
    },
  },
}
