import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Delete,
  HttpCode,
  Body,
  QueryParams,
  Params,
  NotFoundError,
  BadRequestError,
} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {injectable} from 'inversify';

interface ICropActivity {
  month: string;
  activity: string;
  description: string;
  type: string;
}

interface ICropSeason {
  name: string;
  months: string[];
  activities: ICropActivity[];
}

interface ICropCalendar {
  crop: string;
  seasons: ICropSeason[];
}

interface IReminder {
  id: string;
  cropName: string;
  activity: string;
  remindBeforeDays: number;
  createdAt: string;
}

// ── In-memory data stores ──
const reminders = new Map<string, IReminder>();
let reminderIdCounter = 1;

// ── Comprehensive Crop Calendar Data ──
const CROP_CALENDARS: ICropCalendar[] = [
  {
    crop: 'Rice',
    seasons: [
      {
        name: 'Kharif',
        months: ['June', 'July', 'August', 'September', 'October', 'November'],
        activities: [
          {month: 'June', activity: 'Land Preparation', description: 'Plough the field 2-3 times with cultivator to achieve fine tilth', type: 'preparation'},
          {month: 'June', activity: 'Sowing / Transplanting', description: 'Transplant 20-25 day old seedlings at 20x15 cm spacing', type: 'sowing'},
          {month: 'July', activity: 'First Fertilizer Application', description: 'Apply Urea 45 kg/acre at active tillering stage', type: 'fertilizing'},
          {month: 'July', activity: 'Weed Management', description: 'First manual or chemical weeding at 20-25 days after transplanting', type: 'weeding'},
          {month: 'August', activity: 'Pest Monitoring', description: 'Scout weekly for stem borer, leaf folder, and brown planthopper', type: 'pest_control'},
          {month: 'August', activity: 'Irrigation Management', description: 'Maintain 5 cm standing water throughout vegetative phase', type: 'irrigation'},
          {month: 'September', activity: 'Second Fertilizer', description: 'Apply Urea 22.5 kg/acre at panicle initiation stage', type: 'fertilizing'},
          {month: 'September', activity: 'Disease Inspection', description: 'Check for blast, sheath blight, and bacterial leaf blight', type: 'pest_control'},
          {month: 'October', activity: 'Water Management', description: 'Maintain 5 cm standing water; drain 7-10 days before harvest', type: 'irrigation'},
          {month: 'October', activity: 'Weed Control', description: 'Second weeding if required before canopy closure', type: 'weeding'},
          {month: 'November', activity: 'Harvesting', description: 'Harvest when 80% grains turn golden brown and moisture is ~20%', type: 'harvesting'},
          {month: 'November', activity: 'Post-Harvest Storage', description: 'Dry grains to 14% moisture and store in gunny bags or silos', type: 'storage'},
        ],
      },
    ],
  },
  {
    crop: 'Wheat',
    seasons: [
      {
        name: 'Rabi',
        months: ['October', 'November', 'December', 'January', 'February', 'March', 'April'],
        activities: [
          {month: 'October', activity: 'Land Preparation', description: 'Plough and level the field after kharif harvest; apply FYM 8-10 tons/acre', type: 'preparation'},
          {month: 'November', activity: 'Sowing', description: 'Sow seeds at 20-22 cm row spacing, 100-120 kg seed/acre', type: 'sowing'},
          {month: 'December', activity: 'First Irrigation', description: 'Apply Crown Root Initiation (CRI) irrigation 20-25 days after sowing', type: 'irrigation'},
          {month: 'December', activity: 'First Fertilizer Application', description: 'Apply DAP 60 kg/acre and Urea 30 kg/acre at sowing or CRI stage', type: 'fertilizing'},
          {month: 'January', activity: 'Weed Management', description: 'Apply weedicides or manual weeding at 30-35 days after sowing', type: 'weeding'},
          {month: 'January', activity: 'Second Irrigation', description: 'Apply irrigation at active tillering (45-50 days after sowing)', type: 'irrigation'},
          {month: 'February', activity: 'Third Irrigation', description: 'Apply irrigation at late jointing / pre-boot stage', type: 'irrigation'},
          {month: 'February', activity: 'Pest Monitoring', description: 'Watch for aphids, termite damage, and wheat rust', type: 'pest_control'},
          {month: 'March', activity: 'Foliar Spray', description: 'Spray Sulphur 0.2% or micronutrient mix for grain filling', type: 'fertilizing'},
          {month: 'March', activity: 'Fourth Irrigation', description: 'Apply irrigation at flowering / early grain filling stage', type: 'irrigation'},
          {month: 'April', activity: 'Harvesting', description: 'Harvest when grains are hard, moisture ~14%, golden colour', type: 'harvesting'},
          {month: 'April', activity: 'Post-Harvest Storage', description: 'Thresh, clean and store in gunny bags in a dry godown', type: 'storage'},
        ],
      },
    ],
  },
  {
    crop: 'Maize',
    seasons: [
      {
        name: 'Kharif',
        months: ['June', 'July', 'August', 'September', 'October'],
        activities: [
          {month: 'June', activity: 'Land Preparation', description: 'Deep ploughing followed by 2 cross harrowings for fine seedbed', type: 'preparation'},
          {month: 'June', activity: 'Sowing', description: 'Sow seeds at 60x20 cm spacing, 2 seeds per hill at 5 cm depth', type: 'sowing'},
          {month: 'July', activity: 'Thinning & Gap Filling', description: 'Remove extra seedlings at 15-20 DAS, maintain one plant per hill', type: 'preparation'},
          {month: 'July', activity: 'First Fertilizer Application', description: 'Apply 1/3rd Urea at knee-high stage (25-30 DAS)', type: 'fertilizing'},
          {month: 'July', activity: 'Weed Management', description: 'First inter-cultivation and weeding at 25-30 days', type: 'weeding'},
          {month: 'August', activity: 'Second Fertilizer', description: 'Apply remaining 2/3rd Urea at tasseling stage', type: 'fertilizing'},
          {month: 'August', activity: 'Pest Monitoring', description: 'Scout for stem borer, shoot fly, and earworm; use pheromone traps', type: 'pest_control'},
          {month: 'August', activity: 'Irrigation', description: 'Critical irrigation at tasseling and silking stages', type: 'irrigation'},
          {month: 'September', activity: 'Weed Control', description: 'Second weeding or hoeing at 45-50 DAS', type: 'weeding'},
          {month: 'October', activity: 'Harvesting', description: 'Harvest when husks turn brown and kernels are hard (90-100 DAS)', type: 'harvesting'},
          {month: 'October', activity: 'Post-Harvest Storage', description: 'Dry to 14% moisture and store in moisture-proof bins', type: 'storage'},
        ],
      },
      {
        name: 'Rabi',
        months: ['October', 'November', 'December', 'January', 'February', 'March'],
        activities: [
          {month: 'October', activity: 'Land Preparation', description: 'Light ploughing after kharif harvest, apply compost', type: 'preparation'},
          {month: 'November', activity: 'Sowing', description: 'Early sowing at 60x20 cm for Rabi maize crop', type: 'sowing'},
          {month: 'December', activity: 'First Irrigation', description: 'Apply irrigation at knee-high stage', type: 'irrigation'},
          {month: 'January', activity: 'Fertilizer & Weeding', description: 'Top-dress with Urea and perform inter-cultivation', type: 'fertilizing'},
          {month: 'February', activity: 'Pest Monitoring', description: 'Monitor for fall armyworm and top borer', type: 'pest_control'},
          {month: 'March', activity: 'Harvesting', description: 'Harvest when husks dry and kernels attain maturity', type: 'harvesting'},
        ],
      },
    ],
  },
  {
    crop: 'Cotton',
    seasons: [
      {
        name: 'Kharif',
        months: ['May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        activities: [
          {month: 'May', activity: 'Land Preparation', description: 'Deep summer ploughing 2-3 times to destroy soil-borne pests', type: 'preparation'},
          {month: 'June', activity: 'Sowing', description: 'Sow BT cotton at 90x60 cm spacing after onset of monsoon', type: 'sowing'},
          {month: 'July', activity: 'Thinning & Gap Filling', description: 'Maintain optimal plant population of 10,000-12,000 plants/acre', type: 'preparation'},
          {month: 'July', activity: 'First Fertilizer', description: 'Apply DAP 60 kg/acre and Potash 30 kg/acre at 20-25 DAS', type: 'fertilizing'},
          {month: 'July', activity: 'Weed Management', description: 'First hoeing and weeding at 25-30 days after sowing', type: 'weeding'},
          {month: 'August', activity: 'Pest Monitoring', description: 'Monitor for bollworm, aphid, jassid, and whitefly weekly', type: 'pest_control'},
          {month: 'August', activity: 'Irrigation', description: 'Provide irrigation if monsoon is deficient, avoid waterlogging', type: 'irrigation'},
          {month: 'September', activity: 'Second Fertilizer', description: 'Apply Urea 45 kg/acre at squaring/boll formation stage', type: 'fertilizing'},
          {month: 'September', activity: 'Pest Control Spray', description: 'Apply neem-based or chemical spray for bollworm if threshold crossed', type: 'pest_control'},
          {month: 'October', activity: 'Weed Control', description: 'Remove weeds and desiccate leaves before picking', type: 'weeding'},
          {month: 'November', activity: 'Picking - First Round', description: 'Pick open bolls carefully avoiding contamination with leaves', type: 'harvesting'},
          {month: 'December', activity: 'Picking - Final Round', description: 'Pick remaining bolls; defoliate if needed for late bolls', type: 'harvesting'},
        ],
      },
    ],
  },
  {
    crop: 'Soybean',
    seasons: [
      {
        name: 'Kharif',
        months: ['June', 'July', 'August', 'September', 'October'],
        activities: [
          {month: 'June', activity: 'Land Preparation', description: 'Plough 2 times after first monsoon showers for moisture conservation', type: 'preparation'},
          {month: 'June', activity: 'Sowing', description: 'Sow at 45x10 cm spacing, 25-30 kg seed/acre with Rhizobium inoculation', type: 'sowing'},
          {month: 'July', activity: 'First Fertilizer', description: 'Apply SSP 120 kg/acre and DAP 25 kg/acre at sowing', type: 'fertilizing'},
          {month: 'July', activity: 'Weed Management', description: 'First weeding at 20-25 DAS or apply pre-emergence herbicide', type: 'weeding'},
          {month: 'August', activity: 'Pest Monitoring', description: 'Scout for girdle beetle, stem fly, and leaf-eating caterpillars', type: 'pest_control'},
          {month: 'August', activity: 'Irrigation', description: 'Provide life-saving irrigation at flowering if rainfall is deficient', type: 'irrigation'},
          {month: 'August', activity: 'Disease Inspection', description: 'Check for leaf blight, rust, and yellow mosaic virus', type: 'pest_control'},
          {month: 'September', activity: 'Weed Control', description: 'Second weeding at 40-45 DAS if needed', type: 'weeding'},
          {month: 'October', activity: 'Harvesting', description: 'Harvest when 80% pods turn brown and seeds rattle in pods', type: 'harvesting'},
          {month: 'October', activity: 'Post-Harvest Storage', description: 'Dry seeds to 9-10% moisture before storing in jute bags', type: 'storage'},
        ],
      },
    ],
  },
  {
    crop: 'Sugarcane',
    seasons: [
      {
        name: 'Annual',
        months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        activities: [
          {month: 'January', activity: 'Ratoon Management', description: 'Apply first dose of fertilizer to ratoon crop after harvest', type: 'fertilizing'},
          {month: 'February', activity: 'Pre-Planting Preparation', description: 'Select disease-free setts, treat with Carbendazim solution', type: 'preparation'},
          {month: 'March', activity: 'Land Preparation', description: 'Deep ploughing, apply FYM 10 tons/acre, level the field', type: 'preparation'},
          {month: 'April', activity: 'Planting', description: 'Plant setts at 75 cm spacing, 2-3 buds per sett, 5 cm deep', type: 'sowing'},
          {month: 'May', activity: 'Earthing Up', description: 'Earthing up at 30 days to support root development', type: 'preparation'},
          {month: 'June', activity: 'First Fertilizer Application', description: 'Apply N: 80 kg, P: 40 kg, K: 40 kg per acre at 30-40 days', type: 'fertilizing'},
          {month: 'June', activity: 'Weed Management', description: 'Inter-cultivation and weeding at 30-40 days after planting', type: 'weeding'},
          {month: 'July', activity: 'Irrigation', description: 'Provide irrigation at 7-10 day intervals during dry spells', type: 'irrigation'},
          {month: 'August', activity: 'Second Fertilizer', description: 'Top-dress with Urea 60 kg/acre at grand growth phase', type: 'fertilizing'},
          {month: 'August', activity: 'Pest Monitoring', description: 'Monitor for early shoot borer, top borer, and smut', type: 'pest_control'},
          {month: 'September', activity: 'Disease Control', description: 'Apply Trichoderma viride for root and stem rot prevention', type: 'pest_control'},
          {month: 'October', activity: 'Irrigation Management', description: 'Reduce irrigation frequency as crop approaches maturity', type: 'irrigation'},
          {month: 'November', activity: 'De-trashing', description: 'Remove dried leaves to improve aeration and reduce pest harbourage', type: 'weeding'},
          {month: 'December', activity: 'Harvesting', description: 'Harvest at 12-14 months when Brix reads 18-20%', type: 'harvesting'},
          {month: 'December', activity: 'Post-Harvest Storage', description: 'Transport cut canes to mill within 24 hours for optimal sugar recovery', type: 'storage'},
        ],
      },
    ],
  },
  {
    crop: 'Banana',
    seasons: [
      {
        name: 'Annual',
        months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        activities: [
          {month: 'January', activity: 'Land Preparation', description: 'Deep ploughing and addition of FYM 15 tons/acre with full dose of P and K', type: 'preparation'},
          {month: 'February', activity: 'Planting', description: 'Plant tissue-culture plants at 1.5x1.5 m spacing in raised beds', type: 'sowing'},
          {month: 'March', activity: 'First Fertilizer', description: 'Apply 50% Nitrogen at 30 days after planting', type: 'fertilizing'},
          {month: 'April', activity: 'Weed Management', description: 'First mechanical weeding and mulching with crop residues', type: 'weeding'},
          {month: 'May', activity: 'Irrigation', description: 'Ensure consistent moisture; drip irrigation preferred at 6-8 litres/day', type: 'irrigation'},
          {month: 'June', activity: 'Desuckering', description: 'Remove unwanted suckers, retain one healthy sword sucker per mat', type: 'preparation'},
          {month: 'July', activity: 'Second Fertilizer', description: 'Apply remaining 50% Nitrogen at 60-75 days after planting', type: 'fertilizing'},
          {month: 'August', activity: 'Pest Monitoring', description: 'Monitor for banana aphid, root weevil, and Sigatoka leaf spot', type: 'pest_control'},
          {month: 'September', activity: 'Propping', description: 'Install G.I. wire props or bamboo stakes to prevent lodging', type: 'preparation'},
          {month: 'October', activity: 'Bunch Covering', description: 'Cover developing bunches with blue polyethylene bags for protection', type: 'preparation'},
          {month: 'November', activity: 'Weed Control', description: 'Final weeding and earthing up around the pseudostem base', type: 'weeding'},
          {month: 'December', activity: 'Harvesting', description: 'Harvest when angular fingers become round; 75-80% maturity', type: 'harvesting'},
          {month: 'December', activity: 'Post-Harvest Handling', description: 'De-hand, wash with chlorinated water, grade and pack for market', type: 'storage'},
        ],
      },
    ],
  },
  {
    crop: 'Potato',
    seasons: [
      {
        name: 'Rabi',
        months: ['October', 'November', 'December', 'January', 'February', 'March', 'April'],
        activities: [
          {month: 'October', activity: 'Land Preparation', description: 'Deep ploughing and 2 harrowings; add FYM 8-10 tons/acre', type: 'preparation'},
          {month: 'October', activity: 'Seed Treatment', description: 'Cut seed tubers into 25-30 g pieces, treat with Mancozeb', type: 'preparation'},
          {month: 'November', activity: 'Planting', description: 'Plant seed pieces at 60x25 cm spacing, 10-12 cm deep in ridges', type: 'sowing'},
          {month: 'November', activity: 'Fertilizer at Sowing', description: 'Apply full P & K and half N at the time of planting', type: 'fertilizing'},
          {month: 'December', activity: 'Irrigation', description: 'First irrigation immediately after planting to ensure sprouting', type: 'irrigation'},
          {month: 'December', activity: 'Weed Management', description: 'First hand weeding or pre-emergence herbicide within 7 days', type: 'weeding'},
          {month: 'January', activity: 'Earthing Up', description: 'Earthing up at 30 days to cover tubers and prevent greening', type: 'preparation'},
          {month: 'January', activity: 'Second Fertilizer', description: 'Top-dress with remaining half Nitrogen at 30-35 DAS', type: 'fertilizing'},
          {month: 'January', activity: 'Irrigation', description: 'Provide 4-5 irrigations at 10-day intervals during critical period', type: 'irrigation'},
          {month: 'February', activity: 'Pest Monitoring', description: 'Monitor for Colorado beetle, late blight, and early blight', type: 'pest_control'},
          {month: 'February', activity: 'Disease Spray', description: 'Spray Metalaxyl + Mancozeb for late blight if symptoms appear', type: 'pest_control'},
          {month: 'March', activity: 'Weed Control', description: 'Second weeding and inter-cultivation at 45-50 DAS', type: 'weeding'},
          {month: 'April', activity: 'Harvesting', description: 'Harvest when foliage yellows and dies back (90-120 DAS)', type: 'harvesting'},
          {month: 'April', activity: 'Post-Harvest Storage', description: 'Cure tubers in shade for 2-3 days, store in dark ventilated shed at 10-12°C', type: 'storage'},
        ],
      },
    ],
  },
];

function generateReminderId(): string {
  return `reminder_${reminderIdCounter++}_${Date.now()}`;
}

@OpenAPI({
  tags: ['crop-calendar'],
  description: 'Crop calendar and farming activity reminders',
})
@injectable()
@JsonController('/crop-calendar')
export class CropCalendarController {
  // ─── GET ALL SUPPORTED CROPS ─────────────────────────────────────────────

  @OpenAPI({summary: 'List all supported crops'})
  @Get('/crops')
  @HttpCode(200)
  async getCrops(): Promise<string[]> {
    return CROP_CALENDARS.map(cc => cc.crop);
  }

  // ─── GET UPCOMING ACTIVITIES (static route before :cropName) ──────────────

  @OpenAPI({summary: 'Get upcoming activities for a crop in the next 30 days'})
  @Get('/:cropName/upcoming')
  @HttpCode(200)
  async getUpcoming(
    @Params() params: {cropName: string},
  ): Promise<ICropActivity[]> {
    const {cropName} = params;
    const calendar = CROP_CALENDARS.find(
      cc => cc.crop.toLowerCase() === decodeURIComponent(cropName).toLowerCase(),
    );

    if (!calendar) {
      throw new NotFoundError(`Crop "${cropName}" not found in calendar`);
    }

    const now = new Date();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const currentMonthIndex = now.getMonth();
    const upcomingMonths: string[] = [];

    for (let i = 0; i < 30; i++) {
      const futureDate = new Date(now);
      futureDate.setDate(now.getDate() + i);
      const monthName = monthNames[futureDate.getMonth()];
      if (!upcomingMonths.includes(monthName)) {
        upcomingMonths.push(monthName);
      }
    }

    // Also include current month
    const currentMonthName = monthNames[currentMonthIndex];
    if (!upcomingMonths.includes(currentMonthName)) {
      upcomingMonths.unshift(currentMonthName);
    }

    const allActivities: ICropActivity[] = [];
    for (const season of calendar.seasons) {
      for (const activity of season.activities) {
        if (upcomingMonths.includes(activity.month)) {
          allActivities.push(activity);
        }
      }
    }

    return allActivities;
  }

  // ─── GET FULL CALENDAR FOR A CROP ────────────────────────────────────────

  @OpenAPI({summary: 'Get full calendar for a crop'})
  @Get('/:cropName')
  @HttpCode(200)
  async getCalendar(
    @Params() params: {cropName: string},
  ): Promise<ICropCalendar> {
    const {cropName} = params;
    const calendar = CROP_CALENDARS.find(
      cc => cc.crop.toLowerCase() === decodeURIComponent(cropName).toLowerCase(),
    );

    if (!calendar) {
      throw new NotFoundError(`Crop "${cropName}" not found in calendar`);
    }

    return calendar;
  }

  // ─── CREATE REMINDER ─────────────────────────────────────────────────────

  @OpenAPI({summary: 'Create a reminder for a crop activity'})
  @Post('/reminders')
  @HttpCode(201)
  async createReminder(
    @Body() body: {cropName: string; activity: string; remindBeforeDays: number; phone?: string},
  ): Promise<IReminder> {
    if (!body?.cropName || !body?.activity || body.remindBeforeDays === undefined) {
      throw new BadRequestError('cropName, activity, and remindBeforeDays are required');
    }

    if (typeof body.remindBeforeDays !== 'number' || body.remindBeforeDays < 0) {
      throw new BadRequestError('remindBeforeDays must be a non-negative number');
    }

    const calendar = CROP_CALENDARS.find(
      cc => cc.crop.toLowerCase() === body.cropName.toLowerCase(),
    );

    if (!calendar) {
      throw new NotFoundError(`Crop "${body.cropName}" not found in calendar`);
    }

    const reminder: IReminder = {
      id: generateReminderId(),
      cropName: body.cropName,
      activity: body.activity,
      remindBeforeDays: body.remindBeforeDays,
      createdAt: new Date().toISOString(),
    };

    reminders.set(reminder.id, reminder);
    return reminder;
  }

  // ─── LIST ALL REMINDERS ──────────────────────────────────────────────────

  @OpenAPI({summary: 'List all reminders'})
  @Get('/reminders')
  @HttpCode(200)
  async getReminders(): Promise<IReminder[]> {
    return Array.from(reminders.values());
  }

  // ─── DELETE REMINDER ─────────────────────────────────────────────────────

  @OpenAPI({summary: 'Delete a reminder'})
  @Delete('/reminders/:reminderId')
  @HttpCode(200)
  async deleteReminder(
    @Params() params: {reminderId: string},
  ): Promise<{success: boolean; message: string}> {
    const {reminderId} = params;

    if (!reminders.has(reminderId)) {
      throw new NotFoundError(`Reminder with id "${reminderId}" not found`);
    }

    reminders.delete(reminderId);
    return {success: true, message: 'Reminder deleted successfully'};
  }
}
