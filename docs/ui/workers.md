# Workers

The Workers page (`/workers`) provides historical visibility into how the runner's worker pool is being used and helps you make informed decisions about worker sizing.

For full documentation see:

- [Worker Stats](/workers/stats) — what data is collected, how charts work, what each metric means
- [Capacity Recommendations](/workers/recommendations) — how to interpret the forecast table and sizing suggestions

::: info Requires database
The Workers page is only available when `runner.workerMonitoring: true` (default) and a database is configured. Without a database, the page shows a disabled state.
:::
