-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here
vim.keymap.set("n", "<C-d>", function()
  vim.cmd([[normal! <C-d>zzz.]])
end)

vim.keymap.set("n", "<C-u>", function()
  vim.cmd([[normal! <C-u>zzz.]])
end)
