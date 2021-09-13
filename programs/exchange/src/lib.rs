use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;
use anchor_spl::token::{self, TokenAccount, Transfer};

declare_id!("Fx9PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod exchange {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, factory: Pubkey) -> ProgramResult {
        let exchange = &mut ctx.accounts.exchange;
        exchange.factory = factory;
        Ok(())
    }

    pub fn create(ctx: Context<Create>, token_a: Pubkey, token_b: Pubkey) -> ProgramResult {
        let exchange = &mut ctx.accounts.exchange;
        exchange.token_a = token_a;
        exchange.token_b = token_b;
        exchange.total_supply_a = 0;
        exchange.total_supply_b = 0;
        Ok(())
    }

    pub fn add_liquidity(
        ctx: Context<UpdateLiquidity>,
        max_tokens_a: u64,
        min_liquidity_a: u64,
        max_tokens_b: u64,
        min_liquidity_b: u64,
        deadline: i64,
    ) -> ProgramResult {
        assert!(
            max_tokens_a > 0 && max_tokens_b > 0 && deadline > ctx.accounts.clock.unix_timestamp
        );

        let exchange = &mut ctx.accounts.exchange;
        if exchange.total_supply_b > 0 {
            // eth_reserve: uint256(wei) = self.balance - msg.value
            // token_reserve: uint256 = self.token.balanceOf(self)
            // token_amount: uint256 = msg.value * token_reserve / eth_reserve + 1
            // liquidity_minted: uint256 = msg.value * total_liquidity / eth_reserve
            // assert max_tokens >= token_amount and liquidity_minted >= min_liquidity
            // self.balances[msg.sender] += liquidity_minted
            // self.totalSupply = total_liquidity + liquidity_minted
            let y_reserve = exchange.total_supply_b - max_tokens_b;
            let x_amount = max_tokens_b * exchange.total_supply_a / y_reserve + 1;
            let liquidity_minted = max_tokens_b * exchange.total_supply_b / y_reserve;
            assert!(max_tokens_a >= x_amount && liquidity_minted >= min_liquidity_a);
            exchange.total_supply_a = exchange.total_supply_a + liquidity_minted;
        } else {
            // token_amount: uint256 = max_tokens
            // initial_liquidity: uint256 = as_unitless_number(self.balance)  # `balance` is already defined
            // self.totalSupply = initial_liquidity
            // self.balances[msg.sender] = initial_liquidity
            // assert self.token.transferFrom(msg.sender, self, token_amount)
            let initial_liquidity = exchange.total_supply_b;
            exchange.total_supply_a = initial_liquidity;
            token::transfer(ctx.accounts.into_context_a(), max_tokens_a)?;
        }

        token::transfer(ctx.accounts.into_context_b(), max_tokens_b)
    }

    pub fn remove_liquidity(
        ctx: Context<UpdateLiquidity>,
        max_tokens_a: u64,
        max_tokens_b: u64,
    ) -> ProgramResult {
        token::transfer(ctx.accounts.into_context_a(), max_tokens_a)?;
        token::transfer(ctx.accounts.into_context_b(), max_tokens_b)
    }

    pub fn get_input_price(_ctx: Context<GetInputPrice>) -> ProgramResult {
        Ok(())
    }

    pub fn get_output_price(_ctx: Context<GetOutputPrice>) -> ProgramResult {
        Ok(())
    }

    pub fn a_to(_ctx: Context<ATo>) -> ProgramResult {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + 32 + 32 + 32 + 8 + 8)]
    pub exchange: Account<'info, Exchange>,
    #[account(signer)]
    pub authority: AccountInfo<'info>,
    #[account(address = system_program::ID)]
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Create<'info> {
    #[account(mut)]
    pub exchange: Account<'info, Exchange>,
}

#[derive(Accounts)]
pub struct UpdateLiquidity<'info> {
    #[account(signer)]
    pub authority: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
    #[account(mut)]
    pub exchange: Account<'info, Exchange>,
    #[account(mut)]
    pub from_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub from_b: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to_b: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct GetInputPrice<'info> {
    pub exchange: Account<'info, Exchange>,
}

#[derive(Accounts)]
pub struct GetOutputPrice<'info> {
    pub exchange: Account<'info, Exchange>,
}

#[derive(Accounts)]
pub struct ATo<'info> {
    pub exchange: Account<'info, Exchange>,
}

impl<'info> UpdateLiquidity<'info> {
    fn into_context_a(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.from_a.to_account_info().clone(),
            to: self.to_a.to_account_info().clone(),
            authority: self.authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }

    fn into_context_b(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.from_b.to_account_info().clone(),
            to: self.to_b.to_account_info().clone(),
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
    pub total_supply_a: u64,
    pub total_supply_b: u64,
}
