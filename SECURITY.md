# Security Policy

## Supported versions

Tabula Mentis is pre-1.0. Security fixes are applied to the latest source and, when
releases exist, the most recent release only. Older builds are not supported.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's **Report a vulnerability** action on the repository's Security
tab to submit a private security advisory. Include:

- affected version or commit;
- platform and installation method;
- reproduction steps or a proof of concept;
- potential impact;
- suggested mitigation, if known.

If private vulnerability reporting is not enabled, ask a maintainer in a
public issue for a private contact channel without disclosing vulnerability
details.

Maintainers should acknowledge a complete report within seven days and provide
status updates as investigation proceeds. Timelines for remediation and
disclosure depend on severity and release readiness. Please allow a reasonable
coordinated-disclosure period.

## Scope and data safety

High-impact areas include vault path authorization, filesystem traversal,
unsafe rendering of vault content, asset URL handling, dependency compromise,
and release artifact integrity.

Tabula Mentis is local-first, but local does not mean encrypted. Vault files are
ordinary files readable by the user's account and by other software with
filesystem access. Do not use a real or sole-copy vault when testing a report;
work from a disposable backup with non-sensitive data.
