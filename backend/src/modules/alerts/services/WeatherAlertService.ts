import { env } from '#root/utils/env.js';
import { STATE_COORDINATES } from '../config/stateCoordinates.js';
import { MongoClient, ObjectId } from 'mongodb';

const IMD_API_URL = env('IMD_API_URL') || 'http://100.100.108.101:18080';
const IMD_WRAPPER_URL = env('IMD_WRAPPER_URL') || '';
const WA_WEBHOOK_URL = env('WA_SEND_MESSAGE_WEBHOOK_API_URL') || '';
const WA_WEBHOOK_KEY = env('WA_WEBHOOK_API_KEY') || '';
const SYSTEM_SENDER_ID = env('WEATHER_ALERT_SENDER_ID') || '';

const SEVERE_WARNING_CODES = new Set([
  'orange_warning',
  'red_warning',
  'extreme',
  'severe',
  'very_heavy_rain',
  'extremely_heavy_rain',
  'heat_wave',
  'severe_heat_wave',
  'cold_wave',
  'severe_cold_wave',
  'thunderstorm',
  'dust_storm',
]);

const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface WeatherAlert {
  state: string;
  district?: string;
  warningType: string;
  severity: 'orange' | 'red';
  message: string;
  issuedAt: Date;
}

export interface AlertLog {
  _id?: ObjectId;
  state: string;
  district?: string;
  warningType: string;
  severity: string;
  message: string;
  sentCount: number;
  failedCount: number;
  sentTo: string[];
  createdAt: Date;
}

export class WeatherAlertService {
  private mongoClient: MongoClient | null = null;

  private async getClient(): Promise<MongoClient> {
    if (!this.mongoClient) {
      const uri = env('MONGODB_URI') || env('MONGODB_URL') || '';
      this.mongoClient = new MongoClient(uri);
      await this.mongoClient.connect();
    }
    return this.mongoClient;
  }

  private getAnnamDb(client: MongoClient) {
    const dbName = env('ANNAM_DB_NAME') || env('ANNAM_DATABASE_NAME') || 'annam';
    return client.db(dbName);
  }

  private getMainDb(client: MongoClient) {
    const dbName = env('DB_NAME') || env('MONGODB_DB_NAME') || 'ajrasakha';
    return client.db(dbName);
  }

  async fetchDistrictWarnings(lat: number, lon: number): Promise<any> {
    try {
      const url = IMD_WRAPPER_URL
        ? `${IMD_WRAPPER_URL}/imd/weather?latitude=${lat}&longitude=${lon}&data_type=district_warnings`
        : `${IMD_API_URL}/imd_weather?latitude=${lat}&longitude=${lon}&data_type=district_warnings`;

      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  parseSevereWarnings(imdData: any, stateName: string): WeatherAlert[] {
    const alerts: WeatherAlert[] = [];
    if (!imdData) return alerts;

    const warnings = imdData.district_warnings || imdData.warnings || [];

    for (const entry of warnings) {
      const days = entry.days || entry.forecast || [];
      for (const day of days) {
        const code = (day.warning_code || day.code || day.type || '').toLowerCase().trim();
        const color = (day.color || day.severity || '').toLowerCase().trim();

        const isOrange = color === 'orange' || code.includes('orange');
        const isRed = color === 'red' || code.includes('red');
        const isSevere = code.includes('extreme') || code.includes('severe')
          || code.includes('very_heavy') || code.includes('heat_wave')
          || code.includes('cold_wave') || code.includes('dust_storm')
          || code.includes('thunderstorm');

        if (isOrange || isRed || (isSevere && SEVERE_WARNING_CODES.has(code))) {
          alerts.push({
            state: stateName,
            district: entry.district || entry.district_name,
            warningType: code,
            severity: isRed ? 'red' : 'orange',
            message: day.message || day.description || `${code.replace(/_/g, ' ')} warning for ${stateName}`,
            issuedAt: new Date(),
          });
        }
      }
    }

    return alerts;
  }

  buildAlertMessage(alert: WeatherAlert): string {
    const severityEmoji = alert.severity === 'red' ? '\u26a0\ufe0f' : '\u26a0\ufe0f';
    const severityText = alert.severity === 'red' ? 'SEVERE' : 'Moderate';

    let msg = `${severityEmoji} WEATHER ALERT (${severityText})\n\n`;
    msg += `State: ${alert.state}\n`;
    if (alert.district) msg += `District: ${alert.district}\n`;
    msg += `Warning: ${alert.warningType.replace(/_/g, ' ')}\n`;
    msg += `Details: ${alert.message}\n\n`;
    msg += `Please take necessary precautions. Stay safe!`;
    return msg;
  }

  async sendWhatsAppAlert(phoneNumber: string, message: string): Promise<boolean> {
    if (!WA_WEBHOOK_URL || !WA_WEBHOOK_KEY || !SYSTEM_SENDER_ID) {
      console.error('[WeatherAlert] WhatsApp webhook not configured');
      return false;
    }

    try {
      const res = await fetch(WA_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-api-key': WA_WEBHOOK_KEY,
        },
        body: JSON.stringify({
          phoneNumber,
          messageText: message,
          sendBy: 'Ajrasakha Weather Alert',
          userId: SYSTEM_SENDER_ID,
        }),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    } catch (err) {
      console.error(`[WeatherAlert] Failed to send to ${phoneNumber}:`, err);
      return false;
    }
  }

  async wasRecentlyAlerted(
    alertLog: any,
    state: string,
    district: string | undefined,
    warningType: string,
  ): Promise<boolean> {
    const cutoff = new Date(Date.now() - ALERT_COOLDOWN_MS);
    const query: any = {
      state,
      warningType,
      createdAt: { $gte: cutoff },
    };
    if (district) query.district = district;

    const existing = await alertLog.findOne(query);
    return !!existing;
  }

  async run(): Promise<{
    statesChecked: number;
    alertsFound: number;
    farmersNotified: number;
    messagesSent: number;
    messagesFailed: number;
  }> {
    const client = await this.getClient();
    const annamDb = this.getAnnamDb(client);
    const mainDb = this.getMainDb(client);
    const users = annamDb.collection('users');
    const alertLogs = mainDb.collection<AlertLog>('weather_alerts');

    const stats = {
      statesChecked: 0,
      alertsFound: 0,
      farmersNotified: 0,
      messagesSent: 0,
      messagesFailed: 0,
    };

    console.log('[WeatherAlert] Starting weather alert scan...');

    const allAlerts: WeatherAlert[] = [];

    for (const [state, coords] of Object.entries(STATE_COORDINATES)) {
      stats.statesChecked++;
      const warnings = await this.fetchDistrictWarnings(coords.lat, coords.lon);
      const alerts = this.parseSevereWarnings(warnings, state);
      allAlerts.push(...alerts);
    }

    stats.alertsFound = allAlerts.length;

    if (allAlerts.length === 0) {
      console.log('[WeatherAlert] No severe weather warnings found.');
      return stats;
    }

    console.log(`[WeatherAlert] Found ${allAlerts.length} severe warning(s).`);

    const sentPhoneNumbers = new Set<string>();

    for (const alert of allAlerts) {
      const alreadyAlerted = await this.wasRecentlyAlerted(
        alertLogs,
        alert.state,
        alert.district,
        alert.warningType,
      );
      if (alreadyAlerted) {
        console.log(`[WeatherAlert] Skipping duplicate alert: ${alert.state} - ${alert.warningType}`);
        continue;
      }

      const query: any = {
        'farmerProfile.state': new RegExp(`^${escapeRegex(alert.state)}$`, 'i'),
        'farmerProfile.phoneNo': { $exists: true, $ne: null, $ne: '' },
      };
      if (alert.district) {
        query['farmerProfile.district'] = new RegExp(`^${escapeRegex(alert.district)}$`, 'i');
      }

      const farmers = await users.find(query).toArray();
      if (farmers.length === 0) continue;

      stats.farmersNotified += farmers.length;
      const message = this.buildAlertMessage(alert);
      const sentTo: string[] = [];
      let sent = 0;
      let failed = 0;

      for (const farmer of farmers) {
        const phone = (farmer as any).farmerProfile?.phoneNo;
        if (!phone || sentPhoneNumbers.has(phone)) continue;

        sentPhoneNumbers.add(phone);
        const ok = await this.sendWhatsAppAlert(phone, message);
        if (ok) {
          sent++;
          sentTo.push(phone);
        } else {
          failed++;
        }

        await new Promise((r) => setTimeout(r, 200));
      }

      stats.messagesSent += sent;
      stats.messagesFailed += failed;

      await alertLogs.insertOne({
        state: alert.state,
        district: alert.district,
        warningType: alert.warningType,
        severity: alert.severity,
        message: alert.message,
        sentCount: sent,
        failedCount: failed,
        sentTo,
        createdAt: new Date(),
      });

      console.log(
        `[WeatherAlert] ${alert.state}/${alert.district || 'state'}: sent ${sent}, failed ${failed}`,
      );
    }

    console.log('[WeatherAlert] Scan complete.', stats);
    return stats;
  }

  async getRecentAlerts(limit = 50): Promise<AlertLog[]> {
    const client = await this.getClient();
    const mainDb = this.getMainDb(client);
    const alertLogs = mainDb.collection<AlertLog>('weather_alerts');
    return alertLogs.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async close() {
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.mongoClient = null;
    }
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
