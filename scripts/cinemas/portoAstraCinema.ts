import { CinemaSchema, type Cinema, type CinemaShowings } from '../types';

export interface APIResponse {
    userdata: Userdata;
    DS:       Ds;
}    

export interface Ds {
    Scheduling:    Scheduling;
    OptinRequired: boolean;
    TicketoFound:  boolean;
}    

export interface Scheduling {
    LocalId:  number;
    LogoPath: string;
    Events:   Event[];
}    

export interface Event {
    EventId:         number;
    Title:           string;
    OriginalTitle:   string;
    Description:     string;
    Actors:          string;
    Type:            Type;
    Is3D:            boolean;
    Director:        string;
    Duration:        string;
    Picture:         string;
    Year:            string;
    Category:        string;
    MovieId:         string;
    TitleId:         string;
    Properties:      string[];
    EventProperties: EventProperty[];
    Days:            Day[];
    IsStreaming:     boolean;
}    

export interface Day {
    GroupedByScreen: boolean;
    Performances:    Performance[];
    Day:             Date;
}    

export interface Performance {
    PerformanceId: number;
    Time:          string;
    Screen:        Screen;
    ScreenId:      number;
    StartTime:     Date;
    EndTime:       Date;
    Duration:      number;
}    

export enum Screen {
    Sala1 = "SALA 1",
    Sala2 = "SALA 2",
    Sala3 = "SALA 3",
    Sala4 = "SALA 4",
    Sala5 = "SALA 5",
    Sala6 = "SALA 6",
    Sala7 = "SALA 7",
}    

export interface EventProperty {
    EventProperty:         string;
    EventPropertyCategory: string;
}    

export enum Type {
    Cinema = "CINEMA",
}    

export interface Userdata {
    StatusOk:   boolean;
    ReasonCode: number;
    Message:    string;
    StackTrace: string;
    Elapsed:    number;
    StartTime:  Date;
    EndTime:    Date;
    TimeTrace:  string[];
    Errors:     any[];
}    


// all info at https://secure.webtic.it/api/wtjsonservices.ashx?languageid=it&localid=5082&trackid=33&wtid=getLocalInfo
const CINEMA : Cinema = {
    name: 'Porto Astra',
    location: 'Padova',
    coordinates: {
        lat: '45.38365',
        lng: '11.8656'
    },
}

const LOG_PREFIX = '[' + CINEMA.name + ']';
const API_URL = 'https://secure.webtic.it/api/wtjsonservices.ashx?localid=5082&trackid=33&wtid=getFullScheduling';

export async function scraper(): Promise<CinemaShowings> {
    const res = await fetch(API_URL);
    const json = (await res.json()) as APIResponse;
    
    return [{
        cinema: CINEMA,
        showings: json.DS.Scheduling.Events.map(event => ({
            film: {
                title: event.Title, // or event.OriginalTitle
            }
        }))
    }];
}