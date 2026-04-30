from __future__ import annotations

from .model import ArchFlowAst, Channel


def contract_details_for_channel(ast: ArchFlowAst, channel: Channel) -> dict[str, str]:
    prefix = f"Contract.{channel.via}."
    details: dict[str, str] = {}
    for key, value in ast.attributes.items():
        if key.startswith(prefix):
            details[key.removeprefix(prefix)] = value
    return dict(sorted(details.items()))
