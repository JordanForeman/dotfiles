return {
  -- Install bluloco.nvim
  {
    "uloco/bluloco.nvim",
    lazy = false,
    priority = 1000,
    dependencies = { "rktjmp/lush.nvim" },
    config = function()
      -- your optional config goes here, see below.
    end,
  },

  -- Set default colorschema
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "bluloco-dark",
    },
  },
}
