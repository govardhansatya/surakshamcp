// Maps ISO codes to display names and localises short safety messages.
// For the hackathon, a small phrase table covers the highest-frequency alerts so voice
// works even offline; free-text messages are translated via the inference /tts pipeline.
import { Injectable } from '@nitrostack/core';

export const LANGUAGES: Record<string, string> = {
  hi: 'Hindi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', mr: 'Marathi',
  gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam', pa: 'Punjabi', ur: 'Urdu',
};

// Pre-translated canonical alerts. Keyed by violation type.
// Standardized messages for all 10 supported Indian languages to ensure high-quality local delivery.
const PHRASES: Record<string, Record<string, string>> = {
  'NO-Hardhat': {
    hi: 'कृपया अपना हेलमेट पहनें। सिर की चोट का खतरा है।',
    ta: 'தயவுசெய்து தலைக்கவசம் அணியவும். தலைக்கு காயம் ஏற்படும் அபாயம்.',
    bn: 'অনুগ্রহ করে হেলমেট পরুন। মাথায় আঘাতের ঝুঁকি আছে।',
    te: 'దయచేసి హెల్మెట్ ధరించండి. తలకు గాయం అయ్యే ప్రమాదం ఉంది.',
    kn: 'ದಯವಿಟ್ಟು ಹೆಲ್ಮೆಟ್ ಧರಿಸಿ. ತಲೆಗೆ ಗಾಯವಾಗುವ ಅಪಾಯವಿದೆ.',
    ml: 'ദയവായി ഹെൽമെറ്റ് ധരിക്കുക. തലയ്ക്ക് പരിക്കേൽക്കാൻ സാധ്യതയുണ്ട്.',
    mr: 'कृपया हेल्मेट परिधान करा. डोक्याला दुखापत होण्याचा धोका आहे.',
    gu: 'કૃપા કરીને હેલ્મેટ પહેરો. માથામાં ઇજા થવાનું જોખમ છે.',
    pa: 'ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਹੈਲਮੇਟ ਪਹਿਨੋ। ਸਿਰ ਦੀ ਸੱਟ ਲੱਗਣ ਦਾ ਖਤਰਾ ਹੈ।',
    ur: 'براہ کرم ہیلمٹ پہنیں۔ سر پر چوٹ لگنے کا خطرہ ہے۔',
    en: 'Please wear your hard hat. Risk of head injury.',
  },
  'NO-Safety Vest': {
    hi: 'कृपया सुरक्षा जैकेट पहनें। वाहन से टकराने का खतरा है.',
    ta: 'பாதுகாப்பு ஜாக்கெட் அணியவும். வாகனம் மோதும் அபாயம்.',
    bn: 'অনুগ্রহ করে সেফটি ভেস্ট পরুন। যানবাহনের ঝুঁকি আছে।',
    te: 'దయచేసి సేఫ్టీ జాకెట్ ధరించండి. వాహన ప్రమాదాల ముప్పు ఉంది.',
    kn: 'ದಯವಿಟ್ಟು ಸುರಕ್ಷತಾ ಜಾಕೆಟ್ ಧರಿಸಿ. ವಾಹನ ಅಪಘಾತದ ಅಪಾಯವಿದೆ.',
    ml: 'ദയവായി സേഫ്റ്റി ജാക്കറ്റ് ധരിക്കുക. വാഹനങ്ങൾ തട്ടാൻ സാധ്യതയുണ്ട്.',
    mr: 'कृपया सुरक्षा जॅकेट घाला. वाहनांची धडक बसण्याचा धोका आहे.',
    gu: 'કૃપા કરીને સેફ્ટી જેકેટ પહેરો. વાહન અકસ્માતનું જોખમ છે.',
    pa: 'ਕਿਰਪਾ ਕਰਕੇ ਸੁਰੱਖਿਆ ਜੈਕਟ ਪਹਿਨੋ। ਵਾਹਨ ਦੀ ਟੱਕਰ ਦਾ ਖਤਰਾ ਹੈ।',
    ur: 'براہ کرم حفاظتی جیکٹ پہنیں۔ گاڑی کی ٹکر کا خطرہ ہے۔',
    en: 'Please wear your safety vest. Risk of being struck by vehicles.',
  },
  'NO-Mask': {
    hi: 'कृपया अपना मास्क पहनें। धूल और धुएं से बचाव के लिए।',
    ta: 'தயவுசெய்து முகக்கவசம் அணியவும். தூசி மற்றும் புகையிலிருந்து பாதுகாப்பு.',
    bn: 'অনুগ্রহ করে মাস্ক পরুন। ধুলা ও ধোঁয়া থেকে সুরক্ষা।',
    te: 'దయచేసి మాస్క్ ధరించండి. దుమ్ము మరియు పొగ నుండి రక్షణ కోసం.',
    kn: 'ದಯವಿಟ್ಟು ಮಾಸ್ಕ್ ಧರಿಸಿ. ಧೂಳು ಮತ್ತು ಹೊಗೆಯಿಂದ ರಕ್ಷಣೆಗಾಗಿ.',
    ml: 'ദയവായി മാസ്ക് ധരിക്കുക. പൊടിപടലങ്ങളിൽ നിന്നും പുകയിൽ നിന്നും സംരക്ഷണം.',
    mr: 'कृपया मास्क घाला. धूळ आणि धुरापासून संरक्षणासाठी.',
    gu: 'કૃપા કરીને માસ્ક પહેરો. ધૂળ અને ધુમાડાથી બચવા માટે.',
    pa: 'ਕਿਰਪਾ ਕਰਕੇ ਮਾਸਕ ਪਹਿਨੋ। ਧੂੜ ਅਤੇ ਧੂੰਏਂ ਤੋਂ ਬਚਾਅ ਲਈ।',
    ur: 'براہ کرم ماسک پہنیں۔ دھول اور دھوئیں سے بچاؤ کے لیے۔',
    en: 'Please wear your mask. Protection against dust and fumes.',
  },
};

@Injectable()
export class LanguageService {
  isSupported(code: string): boolean {
    return code in LANGUAGES;
  }

  name(code: string): string {
    return LANGUAGES[code] ?? code;
  }

  // Returns a pre-translated phrase if available, else null (caller falls back to TTS translate).
  cannedPhrase(violationType: string, langCode: string): string | null {
    return PHRASES[violationType]?.[langCode] ?? null;
  }
}
