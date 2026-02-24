---
description: Core principles for writing clean, maintainable code from the start
---

# Clean Code Principles

## 🎯 Problem Analysis First
- **Read requirements thoroughly** - Comments, documentation, and tests often reveal what's actually expected
- **Question assumptions** - If tests are "broken," investigate whether they're testing legitimate behavior
- **Fix root causes** - Address production code issues, not test workarounds

## 🏗️ Design for Clarity
- **Start with clean design** - Don't plan to refactor later, design well upfront
- **Functional when possible** - Pure input→output transformations are easier to test and reason about
- **Avoid coupling** - Method signatures requiring multiple related objects often signal design issues

## ✨ Implementation Guidelines
- **Minimal comments** - Code should speak for itself; only comment truly obtuse things (complex regex, business rules)
- **Extract complex logic immediately** - Don't nest 10+ lines inside loops, pull to private methods with descriptive names
- **Use framework idioms** - Leverage built-in utilities (Rails date methods, etc.) rather than reinventing
- **Consider method signatures** - Clean, simple parameters usually indicate good design

## 🔄 Refactoring Mindset
- **Address code smells during review** - Coupling, verbosity, and complexity are design issues worth fixing
- **Think functionally first** - Can this be a simple transformation instead of complex state manipulation?
- **Work with frameworks** - Understand how framework methods work and design around them, not against them

## 🧪 Testing Philosophy  
- **Tests reveal truth** - If tests break when you change behavior, investigate whether the behavior should change
- **Test legitimate use cases** - Don't skip tests that validate supported API behaviors
- **Fix production code** - When tests reveal production issues, fix the production code

These principles apply across languages and domains - the goal is to start with clean, maintainable code rather than planning to refactor later.