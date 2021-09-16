//! An example of an AMM program, inspired by Uniswap V1 seen here:
//! https://github.com/Uniswap/uniswap-v1/. This example has some
//! implementation changes to address the differences between the EVM and
//! Solana's BPF-modified LLVM, but more or less should be the same overall.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;
use anchor_spl::token::{self, Burn, MintTo, TokenAccount, Transfer};

declare_id!("Fx9PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// Exchange
#[program]
pub mod exchange {
    use super::*;

    /// Initializes the exchange account
    pub fn initialize(ctx: Context<Initialize>) -> ProgramResult {
        Ok(())
    }

    /// This function acts as a contract constructor which is not currently
    /// supported in contracts deployed using `initialize()` which is called once
    /// by the factory during contract creation.
    pub fn create(
        ctx: Context<Create>,
        factory: Pubkey,
        token_a: Pubkey,
        token_b: Pubkey,
        token_c: Pubkey,
    ) -> ProgramResult {
        let exchange = &mut ctx.accounts.exchange;
        exchange.factory = factory;
        exchange.token_a = token_a;
        exchange.token_b = token_b;
        exchange.token_c = token_c;
        exchange.total_supply_c = 0;
        Ok(())
    }

    /// Deposit B and A at current ratio to mint C tokens.
    /// min_liquidity_c does nothing when total C supply is 0.
    /// max_amount_a Maximum number of A deposited. Deposits max amount if total C supply is 0.
    /// amount_b Amount of B deposited.
    /// min_liquidity_c Minimum number of C sender will mint if total C supply is greater than 0.
    /// deadline Time after which this transaction can no longer be executed.
    #[access_control(add_future_deadline(&ctx, deadline) add_correct_tokens(&ctx))]
    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        max_amount_a: u64,
        amount_b: u64,
        min_liquidity_c: u64,
        deadline: i64,
    ) -> ProgramResult {
        let exchange = &mut ctx.accounts.exchange;
        let mut liquidity_minted = amount_b;
        let mut amount_a = max_amount_a;
        if exchange.total_supply_c > 0 {
            assert!(min_liquidity_c > 0);
            amount_a = amount_b * ctx.accounts.to_a.amount / ctx.accounts.to_b.amount;
            liquidity_minted = amount_b * exchange.total_supply_c / ctx.accounts.to_a.amount;
            assert!(max_amount_a >= amount_a && liquidity_minted >= min_liquidity_c);
        }
        exchange.total_supply_c += liquidity_minted;
        token::transfer(ctx.accounts.into_context_a(), amount_a)?;
        token::transfer(ctx.accounts.into_context_b(), amount_b)?;
        token::mint_to(ctx.accounts.into_context_c(), liquidity_minted)?;
        Ok(())
    }

    /// Burn C tokens to withdraw B and A at current ratio.
    /// amount_c Amount of C burned.
    /// min_amount_a Minimum A withdrawn.
    /// min_amount_b Minimum B withdrawn.
    /// deadline Time after which this transaction can no longer be executed.
    #[access_control(remove_future_deadline(&ctx, deadline) remove_correct_tokens(&ctx))]
    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        amount_c: u64,
        min_amount_a: u64,
        min_amount_b: u64,
        deadline: i64,
    ) -> ProgramResult {
        let exchange = &mut ctx.accounts.exchange;
        let amount_a = amount_c * ctx.accounts.from_a.amount / exchange.total_supply_c;
        let amount_b = amount_c * ctx.accounts.from_b.amount / exchange.total_supply_c;
        exchange.total_supply_c -= amount_c;
        token::burn(ctx.accounts.into_context_c(), amount_c)?;
        token::transfer(ctx.accounts.into_context_a(), amount_a)?;
        token::transfer(ctx.accounts.into_context_b(), amount_b)
    }

    /// Pricing function for converting between B and A.
    /// input_amount Amount of B or A being sold.
    /// input_reserve Amount of B or A (input type) in exchange reserves.
    /// output_reserve Amount of B or A (output type) in exchange reserves.
    pub fn get_input_price(
        ctx: Context<GetInputPrice>,
        input_amount: u64,
        input_reserve: u64,
        output_reserve: u64,
    ) -> ProgramResult {
        let fee = 0.0097;
        let input_amount_with_fee = input_amount as f64 * fee;
        let numerator = input_amount_with_fee * output_reserve as f64;
        let demonominator = input_reserve as f64 + input_amount_with_fee;
        let exchange = &mut ctx.accounts.exchange;
        exchange.input_price = (numerator / demonominator) as u64;
        Ok(())
    }

    /// Pricing function for converting between B and A.
    /// output_amount Amount of B or A being bought.
    /// input_reserve Amount of B or A (input type) in exchange reserves.
    /// output_reserve Amount of B or A (output type) in exchange reserves.
    pub fn get_output_price(
        ctx: Context<GetOutputPrice>,
        output_amount: u64,
        input_reserve: u64,
        output_reserve: u64,
    ) -> ProgramResult {
        let fee = 0.0097;
        let numerator = input_reserve * output_amount;
        let denominator = (output_reserve - output_amount) as f64 * fee;
        let exchange = &mut ctx.accounts.exchange;
        exchange.output_price = 0;
        Ok(())
    }

    pub fn a_to(_ctx: Context<ATo>) -> ProgramResult {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(signer)]
    pub authority: AccountInfo<'info>,
    #[account(address = system_program::ID)]
    pub system_program: AccountInfo<'info>,
    #[account(init, payer = authority, space = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8)]
    pub exchange: Account<'info, Exchange>,
}

#[derive(Accounts)]
pub struct Create<'info> {
    #[account(mut)]
    pub exchange: Account<'info, Exchange>,
}

#[derive(Accounts)]
#[instruction(max_amount_a: u64, amount_b: u64)]
pub struct AddLiquidity<'info> {
    #[account(signer)]
    pub authority: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
    #[account(mut)]
    pub exchange: Account<'info, Exchange>,
    #[account(mut)]
    pub mint: AccountInfo<'info>,
    #[account(mut, constraint = max_amount_a > 0)]
    pub from_a: AccountInfo<'info>,
    #[account(mut)]
    pub to_a: Account<'info, TokenAccount>,
    #[account(mut, constraint = amount_b > 0)]
    pub from_b: AccountInfo<'info>,
    #[account(mut)]
    pub to_b: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to_c: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(amount_c: u64, min_amount_a: u64, min_amount_b: u64)]
pub struct RemoveLiquidity<'info> {
    pub authority: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
    #[account(signer, mut, constraint = exchange.total_supply_c > 0)]
    pub exchange: Account<'info, Exchange>,
    #[account(mut)]
    pub mint: AccountInfo<'info>,
    #[account(mut, constraint = min_amount_a > 0)]
    pub from_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to_a: AccountInfo<'info>,
    #[account(mut, constraint = min_amount_b > 0)]
    pub from_b: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to_b: AccountInfo<'info>,
    #[account(mut, constraint = amount_c > 0)]
    pub to_c: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(input_reserve: u64, output_reserve: u64)]
pub struct GetInputPrice<'info> {
    #[account(constraint = input_reserve > 0 && output_reserve > 0)]
    pub exchange: Account<'info, Exchange>,
}

#[derive(Accounts)]
#[instruction(input_reserve: u64, output_reserve: u64)]
pub struct GetOutputPrice<'info> {
    #[account(constraint = input_reserve > 0 && output_reserve > 0)]
    pub exchange: Account<'info, Exchange>,
}

#[derive(Accounts)]
pub struct ATo<'info> {
    pub exchange: Account<'info, Exchange>,
}

impl<'info> AddLiquidity<'info> {
    fn into_context_a(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.from_a.clone(),
            to: self.to_a.to_account_info().clone(),
            authority: self.authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }

    fn into_context_b(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.from_b.clone(),
            to: self.to_b.to_account_info().clone(),
            authority: self.authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }

    fn into_context_c(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
        let cpi_accounts = MintTo {
            mint: self.mint.clone(),
            to: self.to_c.clone(),
            authority: self.authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}

impl<'info> RemoveLiquidity<'info> {
    fn into_context_a(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.from_a.to_account_info().clone(),
            to: self.to_a.clone(),
            authority: self.exchange.to_account_info().clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }

    fn into_context_b(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.from_b.to_account_info().clone(),
            to: self.to_b.clone(),
            authority: self.exchange.to_account_info().clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }

    fn into_context_c(&self) -> CpiContext<'_, '_, '_, 'info, Burn<'info>> {
        let cpi_accounts = Burn {
            mint: self.mint.clone(),
            to: self.to_c.clone(),
            authority: self.authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}

#[account]
pub struct Exchange {
    pub factory: Pubkey,
    pub token_a: Pubkey,
    pub token_b: Pubkey,
    pub token_c: Pubkey,
    pub total_supply_c: u64,
    pub input_price: u64,
    pub output_price: u64,
}

#[error]
pub enum ErrorCode {
    #[msg("Adding or removing liquidity must be done in the present or future time")]
    FutureDeadline,
    #[msg("Incorrect tokens")]
    CorrectTokens,
}

fn add_future_deadline<'info>(ctx: &Context<AddLiquidity<'info>>, deadline: i64) -> Result<()> {
    if !(ctx.accounts.clock.unix_timestamp <= deadline) {
        return Err(ErrorCode::FutureDeadline.into());
    }
    Ok(())
}

fn remove_future_deadline<'info>(
    ctx: &Context<RemoveLiquidity<'info>>,
    deadline: i64,
) -> Result<()> {
    if !(ctx.accounts.clock.unix_timestamp <= deadline) {
        return Err(ErrorCode::FutureDeadline.into());
    }
    Ok(())
}

fn add_correct_tokens<'info>(ctx: &Context<AddLiquidity<'info>>) -> Result<()> {
    if !(ctx.accounts.to_a.mint.key() == ctx.accounts.exchange.token_a.key()) {
        return Err(ErrorCode::CorrectTokens.into());
    }
    if !(ctx.accounts.to_b.mint.key() == ctx.accounts.exchange.token_b.key()) {
        return Err(ErrorCode::CorrectTokens.into());
    }
    if !(ctx.accounts.mint.key() == ctx.accounts.exchange.token_c.key()) {
        return Err(ErrorCode::CorrectTokens.into());
    }
    Ok(())
}

fn remove_correct_tokens<'info>(ctx: &Context<RemoveLiquidity<'info>>) -> Result<()> {
    if !(ctx.accounts.from_a.mint.key() == ctx.accounts.exchange.token_a.key()) {
        return Err(ErrorCode::CorrectTokens.into());
    }
    if !(ctx.accounts.from_b.mint.key() == ctx.accounts.exchange.token_b.key()) {
        return Err(ErrorCode::CorrectTokens.into());
    }
    if !(ctx.accounts.mint.key() == ctx.accounts.exchange.token_c.key()) {
        return Err(ErrorCode::CorrectTokens.into());
    }
    Ok(())
}
