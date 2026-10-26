// بيانات الأرشيف. هذي بيانات تجريبية: غيّر الأسماء والقصص، وأضف صورك لاحقًا.
// image: مسار الصورة داخل مجلد images، أو null لو ما فيه صورة بعد.

window.ARCHIVE = {
  familyName: 'عائلتنا',

  // بصمة SHA-256 لكلمة السر. الافتراضية: 1234
  // تنبيه: هذي حماية شكلية فقط، لا تحط صور حقيقية قبل نقل الموقع على Cloudflare.
  passwordHash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',

  people: [
    { id: 'grandpa', name: 'الجد', image: null, born: '[سنة الميلاد]', bio: '[نبذة قصيرة عن الجد]' },
    { id: 'grandma', name: 'الجدة', image: null, born: '[سنة الميلاد]', bio: '[نبذة قصيرة عن الجدة]' },
    { id: 'father', name: 'الوالد', image: null, born: '', bio: '' },
    { id: 'mother', name: 'الوالدة', image: null, born: '', bio: '' },
    { id: 'uncle', name: 'العم', image: null, born: '', bio: '' },
    { id: 'aunt', name: 'العمة', image: null, born: '', bio: '' },
    { id: 'maternal-uncle', name: 'الخال', image: null, born: '', bio: '' },
    { id: 'maternal-aunt', name: 'الخالة', image: null, born: '', bio: '' }
  ],

  // type: photo أو document
  // date: نص مرن يظهر للناس. year: سنة تقريبية للترتيب.
  items: [
    { id: 'i01', type: 'photo', title: '[عنوان الصورة]', date: 'تقريبًا 1968', year: 1968, place: '[المكان]', occasion: 'عرس', people: ['grandpa', 'grandma'], caption: '', story: '[قصة الصورة]', image: null },
    { id: 'i02', type: 'photo', title: '[عنوان الصورة]', date: '1972', year: 1972, place: '[المكان]', occasion: '', people: ['grandpa', 'father'], caption: '', story: '[قصة الصورة]', image: null },
    { id: 'i03', type: 'document', title: '[عنوان المستند]', date: '1974', year: 1974, place: '', occasion: '', people: ['grandpa'], caption: '', story: '[وش هذا المستند وقصته]', image: null },
    { id: 'i04', type: 'photo', title: '[عنوان الصورة]', date: '1976', year: 1976, place: '[المكان]', occasion: 'عيد', people: ['grandpa', 'grandma', 'father', 'uncle'], caption: '', story: '[قصة الصورة]', image: null },
    { id: 'i05', type: 'photo', title: '[عنوان الصورة]', date: 'تقريبًا 1979', year: 1979, place: '[المكان]', occasion: '', people: ['grandma', 'aunt'], caption: '', story: '[قصة الصورة]', image: null },
    { id: 'i06', type: 'photo', title: '[عنوان الصورة]', date: '1982', year: 1982, place: '[المكان]', occasion: 'عرس', people: ['father', 'mother'], caption: '', story: '[قصة الصورة]', image: null },
    { id: 'i07', type: 'document', title: '[عنوان المستند]', date: '1985', year: 1985, place: '', occasion: '', people: ['father'], caption: '', story: '[وش هذا المستند وقصته]', image: null },
    { id: 'i08', type: 'photo', title: '[عنوان الصورة]', date: '1987', year: 1987, place: '[المكان]', occasion: 'عيد', people: ['grandpa', 'mother', 'maternal-uncle'], caption: '', story: '[قصة الصورة]', image: null },
    { id: 'i09', type: 'photo', title: '[عنوان الصورة]', date: '1990', year: 1990, place: '[المكان]', occasion: '', people: ['maternal-uncle', 'maternal-aunt'], caption: '', story: '[قصة الصورة]', image: null },
    { id: 'i10', type: 'photo', title: '[عنوان الصورة]', date: '1993', year: 1993, place: '[المكان]', occasion: 'تخرج', people: ['uncle'], caption: '', story: '[قصة الصورة]', image: null },
    { id: 'i11', type: 'document', title: '[عنوان المستند]', date: '1995', year: 1995, place: '', occasion: '', people: ['grandma'], caption: '', story: '[وش هذا المستند وقصته]', image: null },
    { id: 'i12', type: 'photo', title: '[عنوان الصورة]', date: '1998', year: 1998, place: '[المكان]', occasion: 'عيد', people: ['grandpa', 'grandma', 'aunt', 'maternal-aunt'], caption: '', story: '[قصة الصورة]', image: null }
  ]
};
