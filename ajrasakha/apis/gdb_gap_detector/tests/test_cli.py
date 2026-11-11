from click.testing import CliRunner
from gdb_gap_detector.cli.main import cli


def test_cli_help():
    """Test top-level CLI --help command."""
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "GDB Coverage Gap Detector CLI" in result.output


def test_cli_run_help():
    """Test 'run --help' command option descriptions."""
    runner = CliRunner()
    result = runner.invoke(cli, ["run", "--help"])
    assert result.exit_code == 0
    assert "--period-days" in result.output
    assert "--write-to-db" in result.output


def test_cli_serve_help():
    """Test 'serve --help' command option descriptions."""
    runner = CliRunner()
    result = runner.invoke(cli, ["serve", "--help"])
    assert result.exit_code == 0
    assert "--port" in result.output
    assert "--host" in result.output


def test_cli_export_help():
    """Test 'export --help' command option descriptions."""
    runner = CliRunner()
    result = runner.invoke(cli, ["export", "--help"])
    assert result.exit_code == 0
    assert "--output" in result.output
