export function _syncContextModeButtons() {
  if (this.destroyed) return;
  const flightsActive = this._contextMode === 'flights';
  const missionsActive = this._contextMode === 'space-missions';
  const solarActive = this._contextMode === 'solar-system';
  const commandActive = this._contextMode === 'home-command';
  const panel = this._globalContextPanel;
  panel?.classList.toggle(
    'context-enabled',
    flightsActive || missionsActive || solarActive || commandActive,
  );
  panel?.setAttribute('data-context-mode', this._contextMode || 'none');
  this._globalContextFlightsBtn?.classList.toggle('active', flightsActive);
  this._globalContextFlightsBtn?.setAttribute(
    'aria-selected',
    String(flightsActive),
  );
  this._globalContextMissionsBtn?.classList.toggle('active', missionsActive);
  this._globalContextMissionsBtn?.setAttribute(
    'aria-selected',
    String(missionsActive),
  );
  this._globalContextSolarBtn?.classList.toggle('active', solarActive);
  this._globalContextSolarBtn?.setAttribute(
    'aria-selected',
    String(solarActive),
  );
  this._globalContextCommandBtn?.classList.toggle('active', commandActive);
  this._globalContextCommandBtn?.setAttribute(
    'aria-selected',
    String(commandActive),
  );
  const transitionBusy = Boolean(this._contextModeChanging);
  // Both Context choices stay in the ordinary Tab sequence. Arrow keys still
  // provide tablist navigation, but must not be the only way to reach Space
  // Missions from the keyboard. Semantic busy state keeps them perceivable
  // while synchronous click guards prevent a second transition.
  for (const button of [
    this._globalContextFlightsBtn,
    this._globalContextMissionsBtn,
    this._globalContextSolarBtn,
    this._globalContextCommandBtn,
  ]) {
    if (!button) continue;
    button.disabled = false;
    button.tabIndex = 0;
    button.setAttribute('aria-disabled', String(transitionBusy));
    button.setAttribute('aria-busy', String(transitionBusy));
  }
  if (this._contextModeStandby)
    this._contextModeStandby.hidden =
      flightsActive || missionsActive || solarActive || commandActive;
  if (this._contextFlightsView)
    this._contextFlightsView.hidden = !flightsActive;
  if (this._contextMissionsView)
    this._contextMissionsView.hidden = !missionsActive;
  if (this._contextSolarView) this._contextSolarView.hidden = !solarActive;
  if (this._contextCommandView)
    this._contextCommandView.hidden = !commandActive;
  this.cockpitView?.syncEntry();
  // Every _contextMode mutation funnels through here; the sync no-ops until
  // the transaction settles, so this is the activation/deactivation edge.
  this.actions.syncDetection();
  this.actions.scheduleLayout();
}
