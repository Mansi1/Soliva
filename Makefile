# Project interface (defuss-vae layout): the same verbs for humans, agents and CI.
# Service: RUN = foreground command; stdout/stderr → var/log/$(NAME).*, pid → tmp/$(NAME).pid (both gitignored).
# test/coverage/e2e exit 2 (UNKNOWN) until defined: the verifier runs them on every gate.
# Toolchain: new projects start on bun (JS/TS) or uv (Python); each placeholder names the default recipe.
# RUN e.g. `bun run src/index.ts` (bun loads .env) | `uv run --env-file .env python -m app`; apps log ISO-8601 UTC first, exit cleanly on SIGTERM.
NAME ?= dev
RUN  ?= bun run dev
N    ?= 50
export RUN
# Installer default dirs as a fallback: shell recipes (setup's own sync included) find tools it just installed,
# while tools already on PATH keep precedence.
export PATH := $(PATH):$(HOME)/.local/bin:$(HOME)/.bun/bin
LOG   = var/log/$(NAME)
PID   = tmp/$(NAME).pid
ALIVE = [ -f $(PID) ] && kill -0 "$$(cat $(PID))" 2>/dev/null

.PHONY: setup start stop restart status log metrics bench test coverage lint e2e verify

# Default goal. Fresh clone or machine: official installers for a missing uv/bun, then exactly the locked deps.
# Only lockfile-declared toolchains are touched, so an existing npm/poetry project is never migrated silently.
setup:
	@if [ -f uv.lock ]; then command -v uv >/dev/null 2>&1 || curl -LsSf https://astral.sh/uv/install.sh | sh; uv sync --locked; fi
	@if [ -f bun.lock ] || [ -f bun.lockb ]; then command -v bun >/dev/null 2>&1 || curl -fsSL https://bun.sh/install | bash; bun install --frozen-lockfile; fi

# Own process group (setsid, else job control) so stop reaps children too; redirected stdio keeps agent shells from hanging.
start:
	@mkdir -p var/log tmp
	@if $(ALIVE); then echo "running pid=$$(cat $(PID))"; exit 0; fi; \
	[ -n "$$RUN" ] || { echo "UNKNOWN[start] BC RUN unset"; exit 6; }; \
	if command -v setsid >/dev/null 2>&1; then nohup setsid sh -c "$$RUN" >$(LOG).stdout 2>$(LOG).stderr </dev/null & \
	else set -m; nohup sh -c "$$RUN" >$(LOG).stdout 2>$(LOG).stderr </dev/null & set +m; fi; \
	echo $$! >$(PID); sleep 1; \
	if $(ALIVE); then echo "running pid=$$(cat $(PID))"; else echo "dead; see: make log"; exit 1; fi

stop:
	@if $(ALIVE); then p=$$(cat $(PID)); kill -s TERM -- -$$p 2>/dev/null || kill -s TERM $$p; \
	i=0; while kill -0 $$p 2>/dev/null && [ $$i -lt 50 ]; do sleep 0.1; i=$$((i+1)); done; \
	kill -s KILL -- -$$p 2>/dev/null || true; fi; rm -f $(PID); echo stopped

restart: stop start

# LSB codes (make prints them as Error N): 0 running, 1 dead with stale pid, 3 stopped.
status:
	@if $(ALIVE); then echo "running pid=$$(cat $(PID))"; \
	elif [ -f $(PID) ]; then echo "dead pid=$$(cat $(PID)); see: make log"; exit 1; \
	else echo stopped; exit 3; fi

log:
	@for f in $(LOG).stdout $(LOG).stderr; do [ -f $$f ] && { echo "== $$f"; tail -n $(N) $$f; }; done; \
	ls $(LOG).* >/dev/null 2>&1 || echo "∅ no logs for $(NAME)"

metrics:  ; @echo "UNKNOWN[metrics] BC undefined: print current service|build metrics"; exit 2
# Vier feste Szenen gegen tools/perf/baseline.json, braucht `make start` (AGENTS.md "Soliva: messen und belegen").
bench:    ; bun run bench
test:     ; bun run test
# Node schreibt "ℹ all files | <Zeilen-%> | ...", das Gate liest "TOTAL <n>%".
coverage:
	@mkdir -p tmp; node --test --experimental-test-coverage tests/*.test.mjs >tmp/coverage.txt 2>&1; s=$$?; \
	tail -n 40 tmp/coverage.txt; awk -F'|' '/all files/ { gsub(/ /, "", $$2); print "TOTAL " $$2 "%" }' tmp/coverage.txt; exit $$s
# Erlaubt: Stil des vorhandenen Codes - new Array(n) belegt bewusst vor, die Kopie vor dem Löschen aus einem Set ist gewollt.
lint:     ; bunx oxlint --deny-warnings -A unicorn/no-new-array -A unicorn/no-useless-spread -A unicorn/prefer-string-starts-ends-with -A typescript/triple-slash-reference
# Das veröffentlichte Artefakt wie auf GitHub Pages (Basispfad /<repo>/, .github/workflows/pages.yml) ausliefern
# und den Rauchtest im Browser dagegen laufen lassen. CHROME = Pfad zu Chrome, falls nicht am macOS-Standardort.
E2E_BASE = /soliva/
e2e:
	BASE_PATH=$(E2E_BASE) bun run build
	@$(MAKE) --no-print-directory start NAME=e2e RUN="BASE_PATH=$(E2E_BASE) bunx vite preview --port 4173 --strictPort"
	@i=0; until curl -sf -o /dev/null http://localhost:4173$(E2E_BASE) || [ $$i -ge 30 ]; do sleep 0.5; i=$$((i+1)); done; \
	node tools/ui/smoke.mjs http://localhost:4173$(E2E_BASE); s=$$?; $(MAKE) --no-print-directory stop NAME=e2e; exit $$s
# What CI runs; the gate runs the same verbs one by one. Fail-fast order: cheapest first.
verify: lint test coverage e2e
