# Savings & Retirement Withdrawal Calculator

A self-contained, responsive web app that projects a retirement portfolio year-by-year and checks **when your money runs out** — modeling layered retirement income (pension → reduced pension + Social Security). Pure HTML/CSS/JS with [Chart.js](https://www.chartjs.org/) for visualization — no build step, no framework, just one file.

**Live build:** open `Retirement-Withdrawal-Calculator.html` in any modern browser. Chart.js is vendored locally under `lib/`, so it works fully offline — no CDN required.

## Run it as a Docker container (Unraid)

The repo ships a `Dockerfile`, `docker-compose.yml`, and an Unraid `template.xml`.

### On your Unraid server (terminal or Unraid web terminal)

```bash
# 1. Get the project onto the server
git clone https://github.com/tsneidin/Savings-Widthdrawal-Calculator.git /mnt/user/appdata/savings-retirement-calculator
cd /mnt/user/appdata/savings-retirement-calculator

# 2. Build the image (nginx serving the calculator on port 80)
docker build -t savings-retirement-calculator:latest .

# 3. Run it — open http://<unraid-ip>:8080 afterwards
docker run -d --name savings-retirement-calculator -p 8080:80 --restart=unless-stopped savings-retirement-calculator:latest
```

Or with compose (same result):

```bash
docker compose up -d
```

### Via the Unraid Docker UI

Once the image exists on the server (`savings-retirement-calculator:latest`), open **Docker → Add Container**, set **Repository** to `savings-retirement-calculator:latest` and map host port → container port `80` (default 8080 → 80). The `template.xml` in this repo mirrors that config and can be imported/referenced if you ever publish the template.

To remove: `docker rm -f savings-retirement-calculator && docker rmi savings-retirement-calculator:latest`.

> Tip: for a one-click Community-Apps install, push the image to Docker Hub (`docker tag ... yourname/savings-retirement-calculator:latest && docker push ...`) and set that repository in the template.

## Features

- **Slider ↔ number controls** – current age, life expectancy, starting balance, monthly spending need, monthly pension (pre-reduction and post-reduction amounts), the age the pension reduces, monthly Social Security and its start age, pension COLA, expected annual return, and inflation rate.
- **Two withdrawal methods** – **Fixed $/month** (inflation-indexed dollar amount) or **% of Balance** (classic 4%-rule style: a selected annual percentage of the current portfolio, withdrawn monthly), switchable with a segmented control; the effective drawdown rate is shown on a KPI card.
- **Multi-source income model** – each month the pension and Social Security income are subtracted from the inflation-adjusted spending need; only the **shortfall is drawn from savings**. The pension pays the pre-reduction amount until the chosen age, then the reduced amount, with the pension COLA compounding on both legs. Social Security is treated as flat (no COLA).
- **Month-by-month simulation** – balances step monthly (or annually, via a toggle) and the run stops exactly at the month the portfolio is exhausted.
- **KPI cards** – total interest earned, total funds withdrawn, the age your money runs out (or *Sustained*), and end-of-period balance.
- **Portfolio chart** – balance over age with a shaded area; the tail after depletion renders red with a run-out marker.
- **"Where Funding Comes From" chart** – a 100% stacked bar graph breaking each year's inflows into **pension**, **Social Security**, and **savings drawdown**, with a dashed line marking the spending need.
- **Monthly spending & income chart** – per-year monthly figures as lines: spending need, pension, Social Security, and the amount drawn from savings each month.
- **Collapsible year-by-year table** – age, starting balance, withdrawals, interest, ending balance, with totals.

## Math model

For each year `y` after retirement (`curAge` to `lifeExpectancy`):

- spending need = `base × (1 + inflation)^y`
- pension income = `(pension_amount × (1 + COLA)^y)` from whichever pension leg is active (`age < reduceAge` ⇒ pre-reduction amount, else the reduced amount)
- Social Security income = `ss` once `age ≥ ssStartAge`, otherwise `0`
- shortfall from savings = `max(0, need − pension − SS)`
- **Monthly compounding**: each month `balance = balance × (1 + return/12) − shortfall`.
- **Annual compounding**: each year `balance = balance × (1 + return) − 12 × shortfall`.
- The portfolio is treated as exhausted the month balance reaches zero.
- Rates are nominal gross returns — subtract your effective tax drag from the return input to model after-tax performance.

## Tests

The repository ships a Node test harness that extracts the *actual* `simulate()` function embedded in the HTML and verifies it against closed-form arithmetic, depletion boundaries, inflation step-ups, pension/SS cash-flow phases, and regression snapshots:

```bash
node test-retirement-calculator.js
```

Currently 26 assertions, all passing.