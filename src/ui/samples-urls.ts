/* Adressen der Aufnahmen, nachgeladen von loadSamples in samples.ts beim ersten Tipp */
import bunny from '../assets/sfx/bunny.mp3';
import clap from '../assets/sfx/clap.mp3';
import crick from '../assets/sfx/crick.mp3';
import crown from '../assets/sfx/crown.mp3';
import deal from '../assets/sfx/deal.mp3';
import egg from '../assets/sfx/egg.mp3';
import emote from '../assets/sfx/emote.mp3';
import heart from '../assets/sfx/heart.mp3';
import horn from '../assets/sfx/horn.mp3';
import ooh from '../assets/sfx/ooh.mp3';
import poo from '../assets/sfx/poo.mp3';
import roll from '../assets/sfx/roll.mp3';
import sad from '../assets/sfx/sad.mp3';
import tomato from '../assets/sfx/tomato.mp3';
import type { SampleName } from './samples';

export const URLS: Readonly<Record<SampleName, string>> = {
  bunny,
  clap,
  crick,
  crown,
  deal,
  egg,
  emote,
  heart,
  horn,
  ooh,
  poo,
  roll,
  sad,
  tomato,
};
