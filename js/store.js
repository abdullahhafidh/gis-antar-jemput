import { db } from './db.js';
import * as Drivers from './actions/drivers.js';
import * as Kids from './actions/kids.js';
import { logLeg, undoLogLeg } from './actions/log-leg.js';
import { topUp, undoTopUp } from './actions/top-up.js';
import { listHistory, deleteTrip, deleteTopup } from './actions/history.js';
import { monthlySummary } from './actions/monthly.js';
import { recomputeDeposits } from './actions/sanity.js';

export function registerStores(Alpine) {
  Alpine.store('toast', {
    visible: false,
    message: '',
    tone: 'ok',
    _undoFn: null,
    show(message, { tone = 'ok', undo = null, ms = 5000 } = {}) {
      this.message = message;
      this.tone = tone;
      this._undoFn = undo;
      this.visible = true;
      clearTimeout(this._t);
      this._t = setTimeout(() => { this.visible = false; this._undoFn = null; }, ms);
    },
    async runUndo() {
      if (this._undoFn) {
        await this._undoFn();
        this.visible = false;
        this._undoFn = null;
      }
    }
  });

  Alpine.store('app', {
    ready: false,
    route: { name: 'home', params: {} },
    drivers: [],
    kids: [],
    todayLegs: [],
    driverDetail: null,

    async bootstrap() {
      await db.open();
      await recomputeDeposits(db);
      await this.refreshLists();
      this.ready = true;
    },

    async refreshLists() {
      console.log('[refreshLists] running...');
      this.drivers = await Drivers.listDrivers(db, { includeArchived: true });
      this.kids = await Kids.listKids(db);
      await this.refreshTodayLegs();
    },

    async refreshTodayLegs() {
      const start = new Date(); start.setHours(0,0,0,0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const trips = await db.trips
        .where('occurredAt')
        .between(start.toISOString(), end.toISOString(), true, false)
        .toArray();
      this.todayLegs = trips;
    },

    driverById(id) {
      return this.drivers.find(d => d.id === id);
    },
    kidById(id) {
      return this.kids.find(k => k.id === id);
    },

    activeDrivers() {
      return this.drivers.filter(d => !d.archived);
    },

    legsForKidToday(kidId) {
      return this.todayLegs.filter(t => t.kidId === kidId);
    },

    isLowBalance(driver) {
      return driver.deposit < driver.dailyRate * (driver.lowBalanceThresholdLegs || 4);
    },

    anyLowBalance() {
      return this.activeDrivers().some(d => this.isLowBalance(d));
    },

    routeChanged(route) {
      this.route = route;
      if (route.name === 'driverDetail') this.openDriverDetail(route.params.id);
    },

    async openDriverDetail(id) {
      const driver = await Drivers.getDriver(db, id);
      if (!driver) { this.driverDetail = null; return; }
      const history = await listHistory(db, id);
      const monthly = await monthlySummary(db, id, this.driverDetail?.selectedYear || new Date().getFullYear(), this.driverDetail?.selectedMonth || (new Date().getMonth() + 1));
      console.log('[openDriverDetail] data fetched:', { id, driver, historyCount: history.length });
      this.driverDetail = {
        driver, history, monthly,
        selectedYear: this.driverDetail?.selectedYear || new Date().getFullYear(),
        selectedMonth: this.driverDetail?.selectedMonth || (new Date().getMonth() + 1)
      };
    },

    async setMonth(year, month) {
      const id = this.driverDetail.driver.id;
      const monthly = await monthlySummary(db, id, year, month);
      this.driverDetail.monthly = monthly;
      this.driverDetail.selectedYear = year;
      this.driverDetail.selectedMonth = month;
    },

    async addDriver(payload) {
      await Drivers.addDriver(db, payload);
      await this.refreshLists();
    },
    async updateDriver(id, patch) {
      await Drivers.updateDriver(db, id, patch);
      await this.refreshLists();
      if (this.driverDetail?.driver.id === id) await this.openDriverDetail(id);
    },
    async archiveDriver(id) {
      await Drivers.archiveDriver(db, id);
      await this.refreshLists();
    },
    async addKid(payload) {
      await Kids.addKid(db, payload);
      await this.refreshLists();
    },
    async updateKid(id, patch) {
      await Kids.updateKid(db, id, patch);
      await this.refreshLists();
    },
    async deleteKid(id) {
      await Kids.deleteKid(db, id);
      await this.refreshLists();
    },

    async logLegFor(kidId, type) {
      try {
        const kid = this.kids.find(k => k.id === kidId);
        if (!kid || kid.driverId == null) {
          Alpine.store('toast').show('Assign a driver to this kid first', { tone: 'err' });
          return;
        }
        const { trip, driver } = await logLeg(db, kidId, type);
        await this.refreshLists();
        Alpine.store('toast').show(
          `${type === 'pickup' ? 'Pickup' : 'Delivery'} logged · −${formatIDR(trip.amount)} · ${driver.name}`,
          { tone: driver.deposit < 0 ? 'err' : 'ok' }
        );
        if (this.driverDetail?.driver.id == driver.id) await this.openDriverDetail(driver.id);
      } catch (e) {
        alert(e.message);
      }
    },

    async topUpDriver(driverId, amount, note) {
      try {
        const { topup, driver } = await topUp(db, driverId, amount, note);
        await this.refreshLists();
        Alpine.store('toast').show(`+${formatIDR(topup.amount)} added to ${driver.name}`);
        if (this.driverDetail?.driver.id == driverId) await this.openDriverDetail(driverId);
      } catch (e) {
        alert(e.message);
      }
    },

    async deleteTrip(id) {
      await deleteTrip(db, id);
      await this.refreshLists();
      if (this.driverDetail) await this.openDriverDetail(this.driverDetail.driver.id);
    },
    async deleteTopup(id) {
      await deleteTopup(db, id);
      await this.refreshLists();
      if (this.driverDetail) await this.openDriverDetail(this.driverDetail.driver.id);
    }
  });
}

function formatIDR(n) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}
