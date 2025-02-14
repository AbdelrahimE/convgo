
export interface CountryCode {
  code: string;
  country: string;
  flag: string;
  name: string;
}

export const countryCodes: CountryCode[] = [
  {
    code: "+1",
    country: "US",
    flag: "🇺🇸",
    name: "United States"
  },
  {
    code: "+44",
    country: "GB",
    flag: "🇬🇧",
    name: "United Kingdom"
  },
  {
    code: "+91",
    country: "IN",
    flag: "🇮🇳",
    name: "India"
  },
  {
    code: "+86",
    country: "CN",
    flag: "🇨🇳",
    name: "China"
  },
  {
    code: "+81",
    country: "JP",
    flag: "🇯🇵",
    name: "Japan"
  },
  {
    code: "+49",
    country: "DE",
    flag: "🇩🇪",
    name: "Germany"
  },
  {
    code: "+33",
    country: "FR",
    flag: "🇫🇷",
    name: "France"
  },
  {
    code: "+61",
    country: "AU",
    flag: "🇦🇺",
    name: "Australia"
  },
  {
    code: "+7",
    country: "RU",
    flag: "🇷🇺",
    name: "Russia"
  },
  {
    code: "+55",
    country: "BR",
    flag: "🇧🇷",
    name: "Brazil"
  },
  {
    code: "+39",
    country: "IT",
    flag: "🇮🇹",
    name: "Italy"
  },
  {
    code: "+34",
    country: "ES",
    flag: "🇪🇸",
    name: "Spain"
  },
  {
    code: "+52",
    country: "MX",
    flag: "🇲🇽",
    name: "Mexico"
  },
  {
    code: "+82",
    country: "KR",
    flag: "🇰🇷",
    name: "South Korea"
  },
  {
    code: "+31",
    country: "NL",
    flag: "🇳🇱",
    name: "Netherlands"
  },
  {
    code: "+90",
    country: "TR",
    flag: "🇹🇷",
    name: "Turkey"
  },
  {
    code: "+966",
    country: "SA",
    flag: "🇸🇦",
    name: "Saudi Arabia"
  },
  {
    code: "+971",
    country: "AE",
    flag: "🇦🇪",
    name: "United Arab Emirates"
  },
  {
    code: "+65",
    country: "SG",
    flag: "🇸🇬",
    name: "Singapore"
  },
  {
    code: "+228",
    country: "TG",
    flag: "🇹🇬",
    name: "Togo"
  }
].sort((a, b) => a.name.localeCompare(b.name));
