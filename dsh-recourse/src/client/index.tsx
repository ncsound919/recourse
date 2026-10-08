import type { Context } from '@deepseek-ai/cordis';

import { MissionControl, PanelIcon } from './MissionControl.js';

/**
 * Client plane: put Recourse in the harness as a first-class destination.
 *
 * Three surfaces are registered, all additive:
 *
 * - `main` keyed `recourse`   -- the panel body in the centre column
 * - `sidebar.panellist`       -- the sidebar nav row that selects it
 * - `/recourse` command       -- a slash command that opens it
 *
 * ## How host services resolve (learned the hard way)
 *
 * The `inject` EXPORT is the mechanism. Services named there are placed into the
 * plugin's own scope, so they arrive as `ctx.slots`, `ctx.layout`, and so on.
 * This is what every shipped catalog example does, and what `dsh-teams-x` does.
 *
 * Two things that do NOT work, both of which failed silently here first:
 *
 * - `ctx.get('slots')` inside `apply`. `apply` runs as soon as the entry is
 *   created, and the service is not in scope yet, so the probe returns
 *   `undefined`, nothing registers, and the plugin looks healthy.
 * - `ctx.inject(['slots'], cb)` as a substitute for the export. That dynamic
 *   form is for services you deliberately did NOT declare -- teams-x uses it for
 *   `commandUi` while declaring four other services in its export. Used for a
 *   declared service from an undeclared scope, the callback simply never fires.
 *
 * Either mistake produces zero errors and a missing feature, which is why
 * `console.warn` (not `ctx.logger`, which the client does not have) is used for
 * every degraded path below.
 *
 * ## Slot choice, and why it is the sanctioned one
 *
 * `CLIENT_SLOT_API` in `@deepseek-ai/dsh-cordis-client-runner` is the
 * machine-readable inventory of all 90 slots. For this panel:
 *
 * - `main` is `keyed`/root. Its `replaceRisk` is "shadows-shipped-ui", but that
 *   applies to REUSING an occupied key -- `conversation` is the reserved one.
 *   A fresh key is added as a new cell. `client-ui-layout`'s README is explicit
 *   that "no global panel is registered by the shipped composition", i.e. this
 *   slot exists for exactly this.
 * - `sidebar.panellist` is `list`/root with `replaceRisk: none`. Its contract
 *   says a fresh id "is added beside the shipped entries".
 *
 * The two MUST share one id: the sidebar builds nav rows from `sidebar.panellist`
 * while `layout.selectPanel` validates against the live `main` registry. A
 * mismatch does not fail at load time -- it throws when the user clicks.
 */

/** Shared panel id. Also the sidebar row id and the `main` slot key. */
export const PANEL_ID = 'recourse';

/**
 * Host services this entry requires.
 *
 * `slots` is the mount point for every registration below. `layout` backs the
 * `/recourse` command. Both are declared rather than probed, for the reasons in
 * the note above.
 *
 * `commandUi` is deliberately absent: it is optional, and the dynamic
 * `ctx.inject` form is the correct way to reach a service this entry does not
 * depend on for its core behaviour.
 */
export const inject = ['slots', 'layout'];

/** Nav row caption. A plain string; see `note` on localization below. */
const PANEL_LABEL = 'Recourse';

export function apply(ctx: Context): void {
  registerPanel(ctx);
  registerCommand(ctx);
}

/**
 * Register the panel body and its sidebar nav row.
 *
 * Both registrations go through `ctx.slots.inject(slot, then)`, which is the
 * documented form: `main` is declared by an entry in `root` and `sidebar.panellist`
 * by an entry in `sidebar`, so each seat only exists while that owner is
 * mounted. Registering eagerly would fail against a half-booted shell.
 */
function registerPanel(ctx: Context): void {
  const slots = (ctx as RecourseHostContext).slots;
  if (slots === undefined || typeof slots.inject !== 'function') {
    console.warn('[dsh-recourse] the slots service is unavailable; the panel cannot mount');
    return;
  }

  // Centre-column body for this panel id.
  slots.inject('main', () => {
    slots.register({ name: 'main', key: PANEL_ID }, MissionControl);
  });

  // The sidebar row that selects it.
  slots.inject('sidebar.panellist', () => {
    slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: PANEL_LABEL }, PanelIcon);
  });
}

/**
 * Register `/recourse`, which selects the panel.
 *
 * `commandUi` is reached through the dynamic inject form because it is optional
 * and intentionally absent from the `inject` export: a host without it loses the
 * slash command and keeps the panel.
 *
 * Localization: when copy is needed, register a dictionary with
 * `ctx.inject(['locale'], (l) => l.locale.register(NS, { en, zh }))` and pass
 * `locale: NS` plus `label: () => t('panel')` on the registrations above, the way
 * `client-ui-schedule` does. Omitted for now: declaring a locale namespace also
 * declares a typed `t` seat on the component props, which this panel does not use.
 */
function registerCommand(ctx: Context): void {
  const layout = (ctx as RecourseHostContext).layout;

  ctx.inject(['commandUi'], (scope) => {
    const command = scope.get('commandUi') as CommandUiLike | undefined;
    if (command === undefined || typeof command.register !== 'function') {
      console.warn('[dsh-recourse] commandUi unavailable; the /recourse command is disabled');
      return;
    }

    ctx.effect(
      () =>
        command.register({
          name: 'recourse',
          description: 'Show the Recourse recursive self-improvement dashboard',
          ui: {
            kind: 'action',
            run: () => {
              if (layout === undefined || typeof layout.selectPanel !== 'function') {
                console.warn('[dsh-recourse] layout unavailable; /recourse cannot select the panel');
                return;
              }
              try {
                layout.selectPanel(PANEL_ID);
              } catch (error) {
                // selectPanel throws when the id has no `main` occupant. Saying so
                // beats a command that silently does nothing.
                console.warn(`[dsh-recourse] /recourse could not open the panel: ${String(error)}`);
              }
            },
          },
        }),
      'dsh-recourse: /recourse command',
    );
  });
}

/** The subset of the slots service this entry uses. */
interface SlotsLike {
  inject(slot: string, then: () => void): void;
  register(registration: Record<string, unknown>, component: unknown): () => void;
}

/** The subset of the command service this entry uses. */
interface CommandUiLike {
  register(spec: Record<string, unknown>): () => void;
}

/** The subset of the layout service this entry uses. */
interface LayoutLike {
  selectPanel(panelId: string): void;
}

/**
 * The host `Context` plus the two OPTIONAL seats this entry feature-detects.
 *
 * `pnpm run typecheck` failed here with:
 *   src/client/index.tsx(85,21): error TS2339: Property 'slots' does not exist on type 'Context'.
 *   src/client/index.tsx(116,22): error TS2339: Property 'layout' does not exist on type 'Context'.
 *
 * The original code read `ctx.slots as SlotsLike | undefined`. A type assertion
 * cannot conjure a property that is not on the type — the error is raised at the
 * property access, before the assertion is even considered — so the `as` cast
 * was doing nothing except hiding the intent.
 *
 * Declaring the seats as optional on a local intersection type states what the
 * code actually means: these services may not be present, which is exactly why
 * every use site already guards with `=== undefined`. The guards are now
 * load-bearing type-wise instead of decorative.
 */
type RecourseHostContext = Context & {
  slots?: SlotsLike;
  layout?: LayoutLike;
};