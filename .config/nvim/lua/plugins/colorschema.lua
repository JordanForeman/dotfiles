return {
  -- Install bluloco.nvim
  {
    "uloco/bluloco.nvim",
    lazy = false,
    priority = 1000,
    dependencies = { "rktjmp/lush.nvim" },
    config = function()
      require("bluloco").setup({
        style = "auto", -- "auto" | "dark" | "light"
        transparent = true,
        italics = false,
        terminal = vim.fn.has("gui_running") == 1, -- bluoco colors are enabled in gui terminals per default.
        guicursor = true,
        rainbow_headings = false, -- if you want different colored headings for each heading level
      })
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
