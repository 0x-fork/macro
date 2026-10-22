"""Regression coverage for preserving existing harness configuration."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch


class ConsolidateAgentConfigTest(unittest.TestCase):
    def test_existing_empty_values_are_preserved_and_missing_values_are_copied(self):
        spec = importlib.util.spec_from_file_location(
            "consolidate_agent_config",
            Path(__file__).with_name("consolidate-agent-config.py"),
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        target = {
            "OPTIONAL_INTEGRATION": "",
            "EXISTING_SECRET": "private-fixture",
            "MCP_PUBLIC_URL": "https://old.example",
        }
        sources = {
            "document-cognition": {
                "OPTIONAL_INTEGRATION": "enabled",
                "EXISTING_SECRET": "replacement-fixture",
                "MISSING_SETTING": "first-source",
                "PIPEDREAM_WEBHOOK_URI": "https://old.example/webhook?secret=fixture",
                "PORT": "8085",
            },
            "mcp-server": {"MISSING_SETTING": "later-source"},
            "agent-schedule-service": {},
            "preview-gateway": {},
        }

        def download(project, config):
            self.assertEqual(config, "dev")
            return dict(target if project == "agent-harness-service" else sources[project])

        def upload(command, **kwargs):
            self.assertEqual(command[:3], ["doppler", "secrets", "upload"])
            target.update(json.loads(Path(command[3]).read_text()))
            return subprocess.CompletedProcess(command, 0)

        output = io.StringIO()
        with (
            patch.object(module, "download", side_effect=download),
            patch.object(module.subprocess, "run", side_effect=upload),
            patch("sys.argv", ["consolidate-agent-config.py", "--config", "dev", "--apply"]),
            contextlib.redirect_stdout(output),
        ):
            module.main()

        self.assertEqual(target["OPTIONAL_INTEGRATION"], "")
        self.assertEqual(target["EXISTING_SECRET"], "private-fixture")
        self.assertEqual(target["MISSING_SETTING"], "first-source")
        self.assertNotIn("PORT", target)
        self.assertEqual(target["MCP_PUBLIC_URL"], "https://mcp-server-dev.macro.com")
        self.assertEqual(target["MCP_CLIENT_PUBLIC_URL"], "https://document-cognition-dev.macro.com")
        self.assertEqual(
            target["PIPEDREAM_WEBHOOK_URI"],
            "https://old.example/webhook?secret=fixture",
        )
        self.assertNotIn("private-fixture", output.getvalue())
        self.assertNotIn("replacement-fixture", output.getvalue())
        self.assertNotIn("secret=fixture", output.getvalue())


if __name__ == "__main__":
    unittest.main()
