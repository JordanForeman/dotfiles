-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here
vim.keymap.set("n", "<C-d>", "<C-d>zz_", { desc = "Page down and center" })
vim.keymap.set("n", "<C-u>", "<C-u>zz_", { desc = "Page up and center" })

vim.keymap.set("n", "<leader>gO", ":!gh browse %:.<CR>", { desc = "Open Current File in GitHub" })
