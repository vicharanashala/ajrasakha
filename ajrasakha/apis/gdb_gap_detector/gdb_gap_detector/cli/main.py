import asyncio
import os
import sys
import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()


@click.group()
def cli() -> None:
    """GDB Coverage Gap Detector CLI Interface."""
    pass


@cli.command()
@click.option("--period-days", default=30, help="Window size in days for disclaimer extraction.")
@click.option("--write-to-db/--no-write-to-db", default=False, help="Save report to MongoDB gap_reports collection.")
@click.option("--mongo-uri", default=None, help="Custom MongoDB connection URI.")
def run(period_days: int, write_to_db: bool, mongo_uri: str | None) -> None:
    """Execute pipeline and display rich tables and ASCII heatmap."""
    console.print(Panel("[bold green]Executing GDB Coverage Gap Detector Pipeline...[/bold green]"))

    async def _runner() -> None:
        from gdb_gap_detector.core import MongoDB
        from gdb_gap_detector.services import run_full_pipeline

        MongoDB.connect(uri=mongo_uri)
        try:
            db = MongoDB.get_db()
            report = await run_full_pipeline(db, period_days=period_days, write_to_db=write_to_db)

            # Render Summary Panel
            tot_disc = report.total_disclaimers_analyzed or report.total_disclaimers
            tot_uniq = report.total_unique_queries or report.unique_queries
            tot_clus = report.total_clusters_found or report.clusters_found

            console.print(f"\n[bold yellow]Analysis Period:[/bold yellow] {report.period_days} Days")
            console.print(f"[bold yellow]Total Disclaimers:[/bold yellow] {tot_disc}")
            console.print(f"[bold yellow]Unique Queries:[/bold yellow] {tot_uniq}")
            console.print(f"[bold yellow]Gap Clusters Found:[/bold yellow] {tot_clus}\n")

            # Render Top Gaps Rich Table
            table = Table(title="Top Prioritized Coverage Gaps", header_style="bold magenta")
            table.add_column("#", style="dim", width=4)
            table.add_column("Priority Level", style="bold")
            table.add_column("Score", justify="right")
            table.add_column("Cluster Name", style="cyan")
            table.add_column("Demand", justify="right")
            table.add_column("Triage Status", style="green")
            table.add_column("Trend", style="yellow")
            table.add_column("Sample Question", style="dim")

            for idx, gap in enumerate(report.top_gaps[:15], 1):
                sample = gap.sample_queries[0] if gap.sample_queries else "N/A"
                if len(sample) > 40:
                    sample = sample[:37] + "..."

                p_style = "red" if gap.priority_level == "CRITICAL" else ("yellow" if gap.priority_level == "HIGH" else "green")
                table.add_row(
                    str(idx),
                    f"[{p_style}]{gap.priority_level}[/{p_style}]",
                    str(gap.priority_score),
                    gap.cluster_name,
                    str(gap.farmer_demand),
                    gap.triage_status,
                    gap.trend_status,
                    sample,
                )

            console.print(table)

            # Render ASCII Coverage Heatmap Matrix
            console.print("\n[bold cyan]🗺️ Regional Coverage Heatmap (Sample Rows)[/bold cyan]")
            heatmap_table = Table(header_style="bold blue")
            heatmap_table.add_column("Domain")
            heatmap_table.add_column("State")
            heatmap_table.add_column("Coverage %", justify="right")
            heatmap_table.add_column("Status", style="bold")
            heatmap_table.add_column("GDB / Disclaimers", justify="right")

            cells = report.heatmap.cells if (report.heatmap and report.heatmap.cells) else (report.heatmap.heatmap if report.heatmap else [])
            for cell in cells[:15]:
                c_style = "green" if cell.status == "good" else ("yellow" if cell.status == "partial" else "red")
                heatmap_table.add_row(
                    cell.domain,
                    cell.state,
                    f"{cell.coverage_score}%",
                    f"[{c_style}]{cell.status.upper()}[/{c_style}]",
                    f"{cell.gdb_count} / {cell.disclaimer_count}",
                )

            console.print(heatmap_table)

        finally:
            MongoDB.disconnect()

    asyncio.run(_runner())


@cli.command()
@click.option("--host", default="0.0.0.0", help="Host interface to bind server.")
@click.option("--port", default=8090, help="Port to bind server.")
@click.option("--reload/--no-reload", default=False, help="Enable auto-reload for development.")
def serve(host: str, port: int, reload: bool) -> None:
    """Launch FastAPI Uvicorn web server."""
    import uvicorn
    console.print(f"[bold green]Launching FastAPI Uvicorn Server on http://{host}:{port}...[/bold green]")
    uvicorn.run("gdb_gap_detector.api.app:app", host=host, port=port, reload=reload)


@cli.command()
@click.option("--output-file", default="gap_report.md", help="Path to write Markdown report.")
@click.option("--period-days", default=30, help="Window size in days.")
def export(output_file: str, period_days: int) -> None:
    """Export GapReport to a Markdown natural language file."""
    async def _export_runner() -> None:
        from gdb_gap_detector.core import MongoDB
        from gdb_gap_detector.pipeline.reporter import generate_markdown_report
        from gdb_gap_detector.services import run_full_pipeline

        MongoDB.connect()
        try:
            db = MongoDB.get_db()
            report = await run_full_pipeline(db, period_days=period_days, write_to_db=False)
            md_content = generate_markdown_report(report)

            with open(output_file, "w", encoding="utf-8") as f:
                f.write(md_content)

            console.print(f"[bold green]Report exported successfully to '{output_file}'![/bold green]")
        finally:
            MongoDB.disconnect()

    asyncio.run(_export_runner())


if __name__ == "__main__":
    cli()
