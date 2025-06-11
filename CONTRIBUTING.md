# Contributing to omni-transactions-sdk

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

1. **Prerequisites**
   - [Bun](https://bun.sh/) (latest version)
   - Node.js v18+ (for compatibility testing)

2. **Installation**
   ```bash
   git clone https://github.com/r-near/omni-transactions-sdk.git
   cd omni-transactions-sdk
   bun install
   ```

3. **Development Commands**
   ```bash
   bun test          # Run tests
   bun run lint      # Run linter and formatter
   bun run typecheck # Type checking
   bun run build     # Build the project
   ```

## Development Workflow

1. **Fork the repository** and create a feature branch
2. **Make your changes** following the code style
3. **Write tests** for new functionality
4. **Run the full test suite** and ensure all checks pass
5. **Submit a pull request** with a clear description

## Code Style

- We use **Biome** for linting and formatting
- Follow **TypeScript strict mode** conventions
- Use **semantic commit messages** (feat:, fix:, docs:, etc.)
- Keep line length under **100 characters**
- Use **double quotes** for strings

## Testing

- Write comprehensive tests for new features
- Test both success and error cases
- Include tests for edge cases and invalid inputs
- Maintain high test coverage

## Pull Request Guidelines

1. **Clear title and description** explaining the changes
2. **Reference related issues** using `Fixes #123` syntax
3. **Keep PRs focused** - one feature/fix per PR
4. **Update documentation** if needed
5. **Ensure CI passes** before requesting review

## Architecture Notes

- **OmniKey**: Core class supporting both production (public-only) and testing (with secret) modes
- **NEAR MPC**: Uses additive key derivation (differs from BIP32 multiplicative)
- **Testing utilities**: Mock MPC behavior for local development
- **Multi-chain support**: Ethereum, Bitcoin, future blockchains

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for general questions
- Check existing issues and discussions first

We appreciate your contributions! 🚀