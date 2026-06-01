import json
import re
import sys


def parse_text(file_paths):
    """Parse extracted Hospital standards text files into structured configuration.

    Output schema mirrors EMS but under key ``hospital_full_configuration``.
    """

    config = {"hospital_full_configuration": []}
    se_ids_seen: set[int] = set()

    # ------------------------------------------------------------------
    # Regex patterns (mirroring EMS parser but adapted for Hospital docs)
    # ------------------------------------------------------------------
    # Service Element lines like "1.Management and Leadership" or
    # "SE 2 Human Resource Management".
    se_pattern = re.compile(
        r"^\s*(?:SE\s+)?(\d+)(?:\.|\s+)([A-Za-z][A-Za-z0-9\s,&\-\(\)]{5,})",
        re.MULTILINE,
    )

    # Section IDs like "7.1 Risk Management".
    section_pattern = re.compile(
        r"^(?:Section\s+)?(\d+\.\d+)\s+([A-Za-z].+)",
        re.IGNORECASE,
    )

    # Standard IDs like "7.1.1 Standard" or "7.1.1 The responsibilities...".
    standard_pattern = re.compile(
        r"^(?:Standard\s+)?(\d+\.\d+\.\d+)\s*(.+)?",
        re.IGNORECASE,
    )

    # Criterion IDs like "7.1.1.1 There are documented ..." or
    # "Criterion 7.1.1.1 There are documented ...".
    criterion_pattern = re.compile(
        r"(?:Criterion\s+)?(\d+\.\d+\.\d+\.\d+)\s*(.+)?",
        re.IGNORECASE,
    )

    # Intent marker lines: "Intent of 7.1.1".
    intent_marker = re.compile(r"Intent of\s+(\d+\.\d+\.\d+)", re.IGNORECASE)

    # Lines like "Default Severity for NC or PC = 4".
    severity_pattern = re.compile(
        r"Default Severity for NC or PC\s*=\s*([1-4])",
        re.IGNORECASE,
    )

    # -----------------------
    # Helper functions
    # -----------------------

    def is_boundary(line: str) -> bool:
        """Return True if the line looks like the start of a new element."""

        if se_pattern.match(line):
            return True
        if section_pattern.match(line):
            return True
        if standard_pattern.match(line):
            return True
        if criterion_pattern.search(line):
            return True
        if intent_marker.search(line):
            return True
        return False

    def split_standard_and_intent(statement: str) -> tuple[str, str]:
        """Split combined 'Standard ... Standard Intent: ...' text.

        Returns ``(pure_statement, intent_text)``. ``intent_text`` may contain
        embedded newlines to preserve paragraphing. Any trailing
        "Criterion Comments" / "Recommendations" headings are removed, even if
        they appear on separate lines in the source.
        """

        if not statement:
            return "", ""

        m = re.search(r"Standard Intent:\s*", statement, re.IGNORECASE)
        if not m:
            return statement.strip(), ""

        pure_statement = statement[: m.start()].strip()
        intent_text = statement[m.end() :].strip()

        # Drop trailing "Criterion Comments" / "Recommendations" blocks which
        # are layout artefacts from the PDF forms, not part of the real intent.
        cleaned_lines: list[str] = []
        for line in intent_text.splitlines():
            stripped = line.strip()
            lower = stripped.lower()
            if lower.startswith("criterion comments") or lower.startswith("recommendations"):
                break
            cleaned_lines.append(line)
        intent_text = "\n".join(cleaned_lines).strip()

        return pure_statement, intent_text

    def collect_following_lines(start_index: int, lines: list[str]) -> tuple[str, int]:
        """Collect continuation lines until a structural boundary.

        For intents we want to preserve paragraphing and bullet layout as
        closely as possible. To do that we:

        - Treat blank lines as paragraph separators (they become empty
          strings in ``parts``);
        - Keep each non-structural line as its own entry; and
        - Join everything with ``"\n"`` so the UI tooltips (which use
          ``white-space: pre-line``) can render line breaks.

        We still skip page markers / standalone numbers and stop when we hit a
        new SE/section/standard/criterion/intent.

        Returns ``(joined_text, next_index)`` where ``next_index`` is the first
        line *after* the collected block.
        """

        parts: list[str] = []
        j = start_index
        while j < len(lines):
            raw = lines[j]
            text = raw.strip()

            # Page markers / bare numbers are never part of the prose.
            if text.startswith("--- Page") or re.match(r"^\d+$", text):
                j += 1
                continue

            # Stop when we hit a new structural element.
            if is_boundary(text):
                break

            # Preserve paragraphing: blank lines become empty entries so the
            # final join with "\n" yields visible paragraph breaks.
            parts.append(text)
            j += 1

        return "\n".join(parts), j

    def extract_severity(start_index: int, lines: list[str]) -> int | None:
        """Look ahead from a criterion line for an explicit default severity.

        Hospital PDFs encode this as e.g. ``"Default Severity for NC or PC = 4"``
        on a line shortly after the Criterion header. We scan a limited window of
        following lines to avoid accidentally crossing into the next criterion.
        Returns an int 1-4 if found, otherwise ``None``.
        """

        max_lookahead = 15
        for j in range(start_index, min(len(lines), start_index + max_lookahead)):
            text = lines[j].strip()
            if not text:
                continue
            m = severity_pattern.search(text)
            if m:
                try:
                    return int(m.group(1))
                except ValueError:
                    return None
        return None

    # -----------------------
    # Main parse loop
    # -----------------------

    for file_path in file_paths:
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        current_se: dict | None = None
        current_section: dict | None = None
        current_standard: dict | None = None
        skip_to = -1

        for i, raw_line in enumerate(lines):
            if i <= skip_to:
                continue

            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("--- Page"):
                continue
            if re.match(r"^\d+$", line):  # bare page/line numbers
                continue

            # 1) Service Element
            se_match = se_pattern.match(line)
            if se_match:
                se_id = int(se_match.group(1))
                se_name = se_match.group(2).strip()
                # Hospitals have SE 1..45
                if 1 <= se_id <= 45 and len(se_name) > 5:
                    if se_id not in se_ids_seen:
                        current_se = {
                            "se_id": se_id,
                            "se_name": se_name.replace("\n", " ").strip().upper(),
                            "sections": [],
                        }
                        config["hospital_full_configuration"].append(current_se)
                        se_ids_seen.add(se_id)
                        current_section = None
                        current_standard = None
                        continue
                    else:
                        # Reuse existing SE block if we've seen this ID already.
                        for existing in config["hospital_full_configuration"]:
                            if existing["se_id"] == se_id:
                                current_se = existing
                                break

            # 2) Section
            section_match = section_pattern.match(line)
            if section_match and current_se:
                pi_id = section_match.group(1)
                title = (
                    section_match.group(2).strip()
                    if section_match.group(2)
                    else "Untitled Section"
                )
                if pi_id.startswith(str(current_se["se_id"]) + "."):
                    if not any(s["section_pi_id"] == pi_id for s in current_se["sections"]):
                        current_section = {
                            "section_pi_id": pi_id,
                            "title": title,
                            "standards": [],
                        }
                        current_se["sections"].append(current_section)
                    else:
                        for s in current_se["sections"]:
                            if s["section_pi_id"] == pi_id:
                                current_section = s
                                break
                    current_standard = None
                    continue

            # 3) Criterion
            criterion_match = criterion_pattern.search(line)
            if criterion_match and current_standard:
                crit_id = criterion_match.group(1)
                desc = (
                    criterion_match.group(2).strip()
                    if criterion_match.group(2)
                    else ""
                )
                if crit_id.startswith(current_standard["standard_id"]):
                    if not any(c["id"] == crit_id for c in current_standard["criteria"]):
                        if not desc and i + 1 < len(lines):
                            desc = lines[i + 1].strip()

                        # Determine critical flag from the nearby "Critical: ..." line, if present.
                        # In the extracted Hospital texts this is encoded as:
                        #   Critical: \\u00fe  -> critical
                        #   Critical: \\u00a8  -> NOT critical
                        is_critical = False
                        crit_text = None

                        if "CRITICAL" in line.upper():
                            crit_text = line
                        elif i + 1 < len(lines) and "CRITICAL" in lines[i + 1].upper():
                            crit_text = lines[i + 1]

                        if crit_text is not None:
                            if "\u00fe" in crit_text:
                                is_critical = True
                            elif "\u00a8" in crit_text:
                                is_critical = False
                            else:
                                # Fallback: if we see the word but no symbol, assume critical.
                                is_critical = True

                        # Attempt to read explicit severity from nearby
                        # "Default Severity for NC or PC = N".
                        sev_value = extract_severity(i, lines)
                        if sev_value is None:
                            sev_value = 3  # Conservative default, matching old behaviour.

                        current_criterion = {
                            "id": crit_id,
                            "description": desc,
                            "is_critical": is_critical,
                            "category": "Basic Process + Patient Care",
                            "severity": sev_value,
                        }
                        current_standard["criteria"].append(current_criterion)
                    continue

            # 4) Standard
            standard_match = standard_pattern.match(line)
            if standard_match and current_section:
                std_id = standard_match.group(1)
                statement = (
                    standard_match.group(2).strip()
                    if standard_match.group(2)
                    else ""
                )
                if std_id.startswith(current_section["section_pi_id"]):
                    if len(std_id.split(".")) == 3:
                        if not any(
                            s["standard_id"] == std_id
                            for s in current_section["standards"]
                        ):
                            extra_text, new_i = collect_following_lines(i + 1, lines)
                            if extra_text:
                                statement = (
                                    (statement + " " + extra_text).strip()
                                    if statement
                                    else extra_text
                                )
                                skip_to = max(skip_to, new_i - 1)

                            pure_statement, inline_intent = split_standard_and_intent(
                                statement
                            )

                            current_standard = {
                                "standard_id": std_id,
                                "statement": pure_statement,
                                "intent_tooltip": inline_intent,
                                "criteria": [],
                            }
                            current_section["standards"].append(current_standard)
                        else:
                            for s in current_section["standards"]:
                                if s["standard_id"] == std_id:
                                    current_standard = s
                                    break
                        continue

            # 5) Intent paragraphs starting with "Intent of X.X.X".
            intent_m = intent_marker.search(line)
            if intent_m and current_standard:
                if intent_m.group(1) == current_standard["standard_id"]:
                    intent_text = line.split(intent_m.group(0))[-1].strip()
                    extra_intent, new_i = collect_following_lines(i + 1, lines)
                    combined = " ".join(
                        t for t in [intent_text, extra_intent] if t
                    ).strip()
                    if combined and not current_standard.get("intent_tooltip"):
                        current_standard["intent_tooltip"] = combined
                    skip_to = max(skip_to, new_i - 1)

    config["hospital_full_configuration"].sort(key=lambda x: x["se_id"])
    return config


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(
            "Usage: python parse_hospital_text.py <output_json_file> <text_file1> [text_file2] ..."
        )
    else:
        output_file = sys.argv[1]
        input_files = sys.argv[2:]
        config = parse_text(input_files)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"Successfully parsed {len(input_files)} files to {output_file}")
