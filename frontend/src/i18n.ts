import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enSchemes from "./locales/en/schemes.json";
import enFertilizer from "./locales/en/fertilizer.json";
import enCropCalendar from "./locales/en/cropCalendar.json";

import hiSchemes from "./locales/hi/schemes.json";
import hiFertilizer from "./locales/hi/fertilizer.json";
import hiCropCalendar from "./locales/hi/cropCalendar.json";

import bnSchemes from "./locales/bn/schemes.json";
import bnFertilizer from "./locales/bn/fertilizer.json";
import bnCropCalendar from "./locales/bn/cropCalendar.json";

import taSchemes from "./locales/ta/schemes.json";
import taFertilizer from "./locales/ta/fertilizer.json";
import taCropCalendar from "./locales/ta/cropCalendar.json";

import teSchemes from "./locales/te/schemes.json";
import teFertilizer from "./locales/te/fertilizer.json";
import teCropCalendar from "./locales/te/cropCalendar.json";

import knSchemes from "./locales/kn/schemes.json";
import knFertilizer from "./locales/kn/fertilizer.json";
import knCropCalendar from "./locales/kn/cropCalendar.json";

import mlSchemes from "./locales/ml/schemes.json";
import mlFertilizer from "./locales/ml/fertilizer.json";
import mlCropCalendar from "./locales/ml/cropCalendar.json";

import mrSchemes from "./locales/mr/schemes.json";
import mrFertilizer from "./locales/mr/fertilizer.json";
import mrCropCalendar from "./locales/mr/cropCalendar.json";

import guSchemes from "./locales/gu/schemes.json";
import guFertilizer from "./locales/gu/fertilizer.json";
import guCropCalendar from "./locales/gu/cropCalendar.json";

import paSchemes from "./locales/pa/schemes.json";
import paFertilizer from "./locales/pa/fertilizer.json";
import paCropCalendar from "./locales/pa/cropCalendar.json";

import odSchemes from "./locales/od/schemes.json";
import odFertilizer from "./locales/od/fertilizer.json";
import odCropCalendar from "./locales/od/cropCalendar.json";

import asSchemes from "./locales/as/schemes.json";
import asFertilizer from "./locales/as/fertilizer.json";
import asCropCalendar from "./locales/as/cropCalendar.json";

import urSchemes from "./locales/ur/schemes.json";
import urFertilizer from "./locales/ur/fertilizer.json";
import urCropCalendar from "./locales/ur/cropCalendar.json";

import neSchemes from "./locales/ne/schemes.json";
import neFertilizer from "./locales/ne/fertilizer.json";
import neCropCalendar from "./locales/ne/cropCalendar.json";

import saSchemes from "./locales/sa/schemes.json";
import saFertilizer from "./locales/sa/fertilizer.json";
import saCropCalendar from "./locales/sa/cropCalendar.json";

import ksSchemes from "./locales/ks/schemes.json";
import ksFertilizer from "./locales/ks/fertilizer.json";
import ksCropCalendar from "./locales/ks/cropCalendar.json";

import sdSchemes from "./locales/sd/schemes.json";
import sdFertilizer from "./locales/sd/fertilizer.json";
import sdCropCalendar from "./locales/sd/cropCalendar.json";

import satSchemes from "./locales/sat/schemes.json";
import satFertilizer from "./locales/sat/fertilizer.json";
import satCropCalendar from "./locales/sat/cropCalendar.json";

import maiSchemes from "./locales/mai/schemes.json";
import maiFertilizer from "./locales/mai/fertilizer.json";
import maiCropCalendar from "./locales/mai/cropCalendar.json";

import mniSchemes from "./locales/mni/schemes.json";
import mniFertilizer from "./locales/mni/fertilizer.json";
import mniCropCalendar from "./locales/mni/cropCalendar.json";

import gomSchemes from "./locales/gom/schemes.json";
import gomFertilizer from "./locales/gom/fertilizer.json";
import gomCropCalendar from "./locales/gom/cropCalendar.json";

import doiSchemes from "./locales/doi/schemes.json";
import doiFertilizer from "./locales/doi/fertilizer.json";
import doiCropCalendar from "./locales/doi/cropCalendar.json";

import brxSchemes from "./locales/brx/schemes.json";
import brxFertilizer from "./locales/brx/fertilizer.json";
import brxCropCalendar from "./locales/brx/cropCalendar.json";

const resources = {
  en: { schemes: enSchemes, fertilizer: enFertilizer, cropCalendar: enCropCalendar },
  hi: { schemes: hiSchemes, fertilizer: hiFertilizer, cropCalendar: hiCropCalendar },
  bn: { schemes: bnSchemes, fertilizer: bnFertilizer, cropCalendar: bnCropCalendar },
  ta: { schemes: taSchemes, fertilizer: taFertilizer, cropCalendar: taCropCalendar },
  te: { schemes: teSchemes, fertilizer: teFertilizer, cropCalendar: teCropCalendar },
  kn: { schemes: knSchemes, fertilizer: knFertilizer, cropCalendar: knCropCalendar },
  ml: { schemes: mlSchemes, fertilizer: mlFertilizer, cropCalendar: mlCropCalendar },
  mr: { schemes: mrSchemes, fertilizer: mrFertilizer, cropCalendar: mrCropCalendar },
  gu: { schemes: guSchemes, fertilizer: guFertilizer, cropCalendar: guCropCalendar },
  pa: { schemes: paSchemes, fertilizer: paFertilizer, cropCalendar: paCropCalendar },
  od: { schemes: odSchemes, fertilizer: odFertilizer, cropCalendar: odCropCalendar },
  as: { schemes: asSchemes, fertilizer: asFertilizer, cropCalendar: asCropCalendar },
  ur: { schemes: urSchemes, fertilizer: urFertilizer, cropCalendar: urCropCalendar },
  ne: { schemes: neSchemes, fertilizer: neFertilizer, cropCalendar: neCropCalendar },
  sa: { schemes: saSchemes, fertilizer: saFertilizer, cropCalendar: saCropCalendar },
  ks: { schemes: ksSchemes, fertilizer: ksFertilizer, cropCalendar: ksCropCalendar },
  sd: { schemes: sdSchemes, fertilizer: sdFertilizer, cropCalendar: sdCropCalendar },
  sat: { schemes: satSchemes, fertilizer: satFertilizer, cropCalendar: satCropCalendar },
  mai: { schemes: maiSchemes, fertilizer: maiFertilizer, cropCalendar: maiCropCalendar },
  mni: { schemes: mniSchemes, fertilizer: mniFertilizer, cropCalendar: mniCropCalendar },
  gom: { schemes: gomSchemes, fertilizer: gomFertilizer, cropCalendar: gomCropCalendar },
  doi: { schemes: doiSchemes, fertilizer: doiFertilizer, cropCalendar: doiCropCalendar },
  brx: { schemes: brxSchemes, fertilizer: brxFertilizer, cropCalendar: brxCropCalendar },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    defaultNS: "schemes",
    ns: ["schemes", "fertilizer", "cropCalendar"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18n_language",
    },
  });

export default i18n;
