begin;

-- ============================================================================
-- Completes the District layer for every remaining Indian State/UT (all 36
-- entries added inactive by 20260814030000_seed_all_india_states_for_admin.sql
-- had zero Districts until now, beyond Maharashtra which
-- 20260814050000_geo_seed_maharashtra_full.sql already completed). This
-- migration is District-only: Talukas for these states are added
-- incrementally in follow-up migrations, prioritized by population/vendor
-- demand, following the exact same additive/idempotent pattern.
--
-- Source: Wikipedia's per-State "List of districts of <State>" pages
-- (each independently fetched and cross-checked against the State's most
-- recent district-reorganisation notification), with two corrections
-- applied where that page's raw table conflated an operational district
-- with a merely proposed/announced one:
--   - West Bengal: only the 23 operationally established districts are
--     included. The 4 additional districts (Basirhat, Sundarban, Jangipur,
--     Arambagh) the State announced in 2026 are explicitly NOT YET
--     operational per the same source and are deliberately left out rather
--     than seeded as if real.
--   - Gujarat: 33 districts (the long-stable configuration). "Vav-Tharad"
--     appeared in one scraped table as a 34th district but could not be
--     independently confirmed as a finalized split of Banaskantha, so it is
--     left out rather than guessed.
-- Every row carries verification_status = 'awaiting_lgd_verification'
-- (the same status Pune's rows carry) pending an LGD NAPIX export --
-- see docs/locations-import.md "Backfilling LGD codes". District-level
-- coordinates are intentionally left NULL for this pass rather than
-- populated with unverified guesses; they can be backfilled per-district in
-- an independently reviewed follow-up migration without touching this one
-- or affecting the hierarchy/toggle functionality this feature needs today.
-- ============================================================================

insert into public.geo_districts (state_id, name, source_name, source_url)
select state.id, d.name, 'Wikipedia: List of districts of ' || state.name, s.url
from public.geo_states state
join (values
  ('Uttar Pradesh', 'https://en.wikipedia.org/wiki/List_of_districts_of_Uttar_Pradesh', array[
    'Agra','Aligarh','Ambedkar Nagar','Amethi','Amroha','Auraiya','Ayodhya','Azamgarh','Baghpat',
    'Bahraich','Ballia','Balrampur','Banda','Barabanki','Bareilly','Basti','Bhadohi','Bijnor',
    'Budaun','Bulandshahr','Chandauli','Chitrakoot','Deoria','Etah','Etawah','Farrukhabad',
    'Fatehpur','Firozabad','Gautam Buddha Nagar','Ghaziabad','Ghazipur','Gonda','Gorakhpur',
    'Hamirpur','Hapur','Hardoi','Hathras','Jalaun','Jaunpur','Jhansi','Kannauj','Kanpur Dehat',
    'Kanpur Nagar','Kasganj','Kaushambi','Kushinagar','Lakhimpur Kheri','Lalitpur','Lucknow',
    'Maharajganj','Mahoba','Mainpuri','Mathura','Mau','Meerut','Mirzapur','Moradabad',
    'Muzaffarnagar','Pilibhit','Pratapgarh','Prayagraj','Rae Bareli','Rampur','Saharanpur',
    'Sambhal','Sant Kabir Nagar','Shahjahanpur','Shamli','Shravasti','Siddharthnagar','Sitapur',
    'Sonbhadra','Sultanpur','Unnao','Varanasi'
  ]::text[]),
  ('Madhya Pradesh', 'https://en.wikipedia.org/wiki/List_of_districts_of_Madhya_Pradesh', array[
    'Agar Malwa','Alirajpur','Anuppur','Ashoknagar','Balaghat','Barwani','Betul','Bhind','Bhopal',
    'Burhanpur','Chhatarpur','Chhindwara','Damoh','Datia','Dewas','Dhar','Dindori','Guna',
    'Gwalior','Harda','Indore','Jabalpur','Jhabua','Katni','Khandwa','Khargone','Mandla',
    'Mandsaur','Maihar','Mauganj','Morena','Narsinghpur','Narmadapuram','Neemuch','Niwari',
    'Panna','Raisen','Rajgarh','Ratlam','Rewa','Sagar','Satna','Sehore','Seoni','Shahdol',
    'Shajapur','Sheopur','Shivpuri','Sidhi','Singrauli','Tikamgarh','Ujjain','Umaria','Vidisha',
    'Pandhurna'
  ]::text[]),
  ('Rajasthan', 'https://en.wikipedia.org/wiki/List_of_districts_of_Rajasthan', array[
    'Ajmer','Alwar','Balotra','Banswara','Baran','Barmer','Beawar','Bharatpur','Bhilwara',
    'Bikaner','Bundi','Chittorgarh','Churu','Dausa','Deeg','Didwana-Kuchaman','Dholpur',
    'Dungarpur','Hanumangarh','Jaipur','Jaisalmer','Jalore','Jhalawar','Jhunjhunu','Jodhpur',
    'Karauli','Khairthal-Tijara','Kota','Kotputli-Behror','Nagaur','Pali','Phalodi','Pratapgarh',
    'Rajsamand','Salumbar','Sawai Madhopur','Sikar','Sirohi','Sri Ganganagar','Tonk','Udaipur'
  ]::text[]),
  ('Bihar', 'https://en.wikipedia.org/wiki/List_of_districts_of_Bihar', array[
    'Araria','Arwal','Aurangabad','Banka','Begusarai','Bhagalpur','Bhojpur','Buxar','Darbhanga',
    'East Champaran','Gaya','Gopalganj','Jamui','Jehanabad','Kaimur','Katihar','Khagaria',
    'Kishanganj','Lakhisarai','Madhepura','Madhubani','Munger','Muzaffarpur','Nalanda','Nawada',
    'Patna','Purnia','Rohtas','Saharsa','Samastipur','Saran','Sheikhpura','Sheohar','Sitamarhi',
    'Siwan','Supaul','Vaishali','West Champaran'
  ]::text[]),
  ('Tamil Nadu', 'https://en.wikipedia.org/wiki/List_of_districts_of_Tamil_Nadu', array[
    'Ariyalur','Chengalpattu','Chennai','Coimbatore','Cuddalore','Dharmapuri','Dindigul','Erode',
    'Kallakurichi','Kanchipuram','Kanyakumari','Karur','Krishnagiri','Madurai','Mayiladuthurai',
    'Nagapattinam','Namakkal','Nilgiris','Perambalur','Pudukkottai','Ramanathapuram','Ranipet',
    'Salem','Sivaganga','Tenkasi','Thanjavur','Theni','Thoothukudi','Tiruchirappalli',
    'Tirunelveli','Tirupathur','Tiruppur','Tiruvallur','Tiruvannamalai','Tiruvarur','Vellore',
    'Viluppuram','Virudhunagar'
  ]::text[]),
  ('Assam', 'https://en.wikipedia.org/wiki/List_of_districts_of_Assam', array[
    'Baksa','Bajali','Barpeta','Biswanath','Bongaigaon','Cachar','Charaideo','Chirang','Darrang',
    'Dhemaji','Dhubri','Dibrugarh','Dima Hasao','Goalpara','Golaghat','Hailakandi','Hojai',
    'Jorhat','Kamrup','Kamrup Metropolitan','Karbi Anglong','Kokrajhar','Lakhimpur','Majuli',
    'Morigaon','Nagaon','Nalbari','Sivasagar','Sonitpur','South Salmara-Mankachar','Sribhumi',
    'Tamulpur','Tinsukia','Udalguri','West Karbi Anglong'
  ]::text[]),
  ('Gujarat', 'https://en.wikipedia.org/wiki/List_of_districts_of_Gujarat', array[
    'Ahmedabad','Amreli','Anand','Aravalli','Banaskantha','Bharuch','Bhavnagar','Botad',
    'Chhota Udaipur','Dahod','Dang','Devbhoomi Dwarka','Gandhinagar','Gir Somnath','Jamnagar',
    'Junagadh','Kheda','Kutch','Mahisagar','Mehsana','Morbi','Narmada','Navsari','Panchmahal',
    'Patan','Porbandar','Rajkot','Sabarkantha','Surat','Surendranagar','Tapi','Vadodara','Valsad'
  ]::text[]),
  ('Karnataka', 'https://en.wikipedia.org/wiki/List_of_districts_of_Karnataka', array[
    'Bagalkote','Ballari','Belagavi','Bengaluru Rural','Bengaluru Urban','Bidar',
    'Chamarajanagara','Chikkaballapura','Chikkamagaluru','Chitradurga','Dakshina Kannada',
    'Davanagere','Dharwad','Gadag','Hassan','Haveri','Kalaburagi','Kodagu','Kolar','Koppal',
    'Mandya','Mysuru','Raichur','Ramanagara','Shivamogga','Tumakuru','Udupi','Uttara Kannada',
    'Vijayapura','Vijayanagara','Yadgir'
  ]::text[]),
  ('West Bengal', 'https://en.wikipedia.org/wiki/List_of_districts_of_West_Bengal', array[
    'Alipurduar','Bankura','Paschim Bardhaman','Purba Bardhaman','Birbhum','Cooch Behar',
    'Darjeeling','Dakshin Dinajpur','Hooghly','Howrah','Jalpaiguri','Jhargram','Kolkata',
    'Kalimpong','Malda','Paschim Medinipur','Purba Medinipur','Murshidabad','Nadia',
    'North 24 Parganas','South 24 Parganas','Purulia','Uttar Dinajpur'
  ]::text[]),
  ('Odisha', 'https://en.wikipedia.org/wiki/List_of_districts_of_Odisha', array[
    'Angul','Balangir','Balasore','Bargarh','Bhadrak','Boudh','Debagarh','Dhenkanal','Gajapati',
    'Ganjam','Jagatsinghpur','Jajpur','Jharsuguda','Kalahandi','Kandhamal','Cuttack','Kendrapara',
    'Kendujhar','Khordha','Koraput','Malkangiri','Mayurbhanj','Nabarangpur','Nayagarh','Nuapada',
    'Puri','Rayagada','Sambalpur','Subarnapur','Sundergarh'
  ]::text[]),
  ('Andhra Pradesh', 'https://en.wikipedia.org/wiki/List_of_districts_of_Andhra_Pradesh', array[
    'Alluri Sitharama Raju','Anakapalli','Ananthapuramu','Annamayya','Bapatla','Chittoor',
    'Dr. B. R. Ambedkar Konaseema','East Godavari','Eluru','Guntur','Kakinada','Krishna',
    'Kurnool','Markapuram','Nandyal','Sri Potti Sriramulu Nellore','NTR','Palnadu',
    'Parvathipuram Manyam','Polavaram','Prakasam','Srikakulam','Sri Sathya Sai','Tirupati',
    'Visakhapatnam','Vizianagaram','West Godavari','YSR Kadapa'
  ]::text[]),
  ('Telangana', 'https://en.wikipedia.org/wiki/List_of_districts_of_Telangana', array[
    'Adilabad','Kumuram Bheem Asifabad','Mancherial','Nirmal','Nizamabad','Jagtial','Peddapalli',
    'Kamareddy','Rajanna Sircilla','Karimnagar','Jayashankar Bhupalpally','Sangareddy','Medak',
    'Siddipet','Jangaon','Hanumakonda','Warangal','Mulugu','Bhadradri Kothagudem','Khammam',
    'Mahabubabad','Suryapet','Nalgonda','Yadadri Bhuvanagiri','Medchal-Malkajgiri','Hyderabad',
    'Ranga Reddy','Vikarabad','Narayanpet','Mahabubnagar','Nagarkurnool','Wanaparthy',
    'Jogulamba Gadwal'
  ]::text[]),
  ('Chhattisgarh', 'https://en.wikipedia.org/wiki/List_of_districts_of_Chhattisgarh', array[
    'Balod','Baloda Bazar','Balrampur','Bastar','Bemetara','Bijapur','Bilaspur','Dantewada',
    'Dhamtari','Durg','Gariaband','Gaurela-Pendra-Marwahi','Janjgir-Champa','Jashpur',
    'Kabirdham','Kanker','Kondagaon','Korba','Koriya','Mahasamund','Manendragarh-Chirmiri-Bharatpur',
    'Mohla-Manpur-Ambagarh Chowki','Mungeli','Narayanpur','Raigarh','Raipur','Rajnandgaon','Sakti',
    'Sarangarh-Bilaigarh','Sukma','Surajpur','Surguja','Khairagarh-Chhuikhadan-Gandai'
  ]::text[]),
  ('Jharkhand', 'https://en.wikipedia.org/wiki/List_of_districts_of_Jharkhand', array[
    'Bokaro','Chatra','Deoghar','Dhanbad','Dumka','East Singhbhum','Garhwa','Giridih','Godda',
    'Gumla','Hazaribagh','Jamtara','Khunti','Koderma','Latehar','Lohardaga','Pakur','Palamu',
    'Ramgarh','Ranchi','Sahibganj','Seraikela Kharsawan','Simdega','West Singhbhum'
  ]::text[]),
  ('Punjab', 'https://en.wikipedia.org/wiki/List_of_districts_of_Punjab,_India', array[
    'Amritsar','Barnala','Bathinda','Faridkot','Fatehgarh Sahib','Fazilka','Firozpur','Gurdaspur',
    'Hoshiarpur','Jalandhar','Kapurthala','Ludhiana','Malerkotla','Mansa','Moga',
    'Sri Muktsar Sahib','Pathankot','Patiala','Rupnagar','Sahibzada Ajit Singh Nagar','Sangrur',
    'Shaheed Bhagat Singh Nagar','Tarn Taran'
  ]::text[]),
  ('Haryana', 'https://en.wikipedia.org/wiki/List_of_districts_of_Haryana', array[
    'Ambala','Bhiwani','Charkhi Dadri','Faridabad','Fatehabad','Gurugram','Hisar','Jhajjar',
    'Jind','Kaithal','Karnal','Kurukshetra','Mahendragarh','Nuh','Palwal','Panchkula','Panipat',
    'Rewari','Rohtak','Sirsa','Sonipat','Yamunanagar'
  ]::text[]),
  ('Kerala', 'https://en.wikipedia.org/wiki/List_of_districts_of_Kerala', array[
    'Alappuzha','Ernakulam','Idukki','Kannur','Kasaragod','Kollam','Kottayam','Kozhikode',
    'Malappuram','Palakkad','Pathanamthitta','Thiruvananthapuram','Thrissur','Wayanad'
  ]::text[]),
  ('Himachal Pradesh', 'https://en.wikipedia.org/wiki/List_of_districts_of_Himachal_Pradesh', array[
    'Bilaspur','Chamba','Hamirpur','Kangra','Kinnaur','Kullu','Lahaul and Spiti','Mandi',
    'Shimla','Sirmaur','Solan','Una'
  ]::text[]),
  ('Uttarakhand', 'https://en.wikipedia.org/wiki/List_of_districts_of_Uttarakhand', array[
    'Almora','Bageshwar','Chamoli','Champawat','Dehradun','Haridwar','Nainital','Pauri Garhwal',
    'Pithoragarh','Rudraprayag','Tehri Garhwal','Udham Singh Nagar','Uttarkashi'
  ]::text[]),
  ('Manipur', 'https://en.wikipedia.org/wiki/List_of_districts_of_Manipur', array[
    'Bishnupur','Chandel','Churachandpur','Imphal East','Imphal West','Jiribam','Kakching',
    'Kamjong','Kangpokpi','Noney','Pherzawl','Senapati','Tamenglong','Tengnoupal','Thoubal',
    'Ukhrul'
  ]::text[]),
  ('Nagaland', 'https://en.wikipedia.org/wiki/List_of_districts_of_Nagaland', array[
    'Chumoukedima','Dimapur','Kiphire','Kohima','Longleng','Mokokchung','Mon','Niuland',
    'Noklak','Peren','Phek','Shamator','Tuensang','Tseminyu','Wokha','Zunheboto'
  ]::text[]),
  ('Meghalaya', 'https://en.wikipedia.org/wiki/List_of_districts_of_Meghalaya', array[
    'East Garo Hills','East Jaintia Hills','East Khasi Hills','Eastern West Khasi Hills',
    'North Garo Hills','Ri Bhoi','South Garo Hills','South West Garo Hills',
    'South West Khasi Hills','West Garo Hills','West Jaintia Hills','West Khasi Hills'
  ]::text[]),
  ('Mizoram', 'https://en.wikipedia.org/wiki/List_of_districts_of_Mizoram', array[
    'Aizawl','Champhai','Hnahthial','Khawzawl','Kolasib','Lawngtlai','Lunglei','Mamit',
    'Saitual','Serchhip','Siaha'
  ]::text[]),
  ('Tripura', 'https://en.wikipedia.org/wiki/List_of_districts_of_Tripura', array[
    'Dhalai','Gomati','Khowai','North Tripura','Sepahijala','South Tripura','Unakoti',
    'West Tripura'
  ]::text[]),
  ('Sikkim', 'https://en.wikipedia.org/wiki/List_of_districts_of_Sikkim', array[
    'East Sikkim','Gyalshing','Mangan','Namchi','Pakyong','Soreng'
  ]::text[]),
  ('Goa', 'https://en.wikipedia.org/wiki/List_of_districts_of_Goa', array[
    'North Goa','South Goa'
  ]::text[]),
  ('Arunachal Pradesh', 'https://en.wikipedia.org/wiki/List_of_districts_of_Arunachal_Pradesh', array[
    'Anjaw','Changlang','Dibang Valley','East Kameng','East Siang','Kamle','Kra Daadi',
    'Kurung Kumey','Lepa Rada','Lohit','Longding','Lower Dibang Valley','Lower Siang',
    'Lower Subansiri','Namsai','Pakke-Kessang','Papum Pare','Shi Yomi','Siang','Tawang',
    'Tirap','Upper Siang','Upper Subansiri','West Kameng','West Siang','Itanagar Capital Complex'
  ]::text[]),
  ('Jammu and Kashmir', 'https://en.wikipedia.org/wiki/List_of_districts_of_Jammu_and_Kashmir', array[
    'Anantnag','Bandipora','Baramulla','Budgam','Doda','Ganderbal','Jammu','Kathua','Kishtwar',
    'Kulgam','Kupwara','Poonch','Pulwama','Rajouri','Ramban','Reasi','Samba','Shopian','Srinagar',
    'Udhampur'
  ]::text[]),
  ('Delhi', 'https://en.wikipedia.org/wiki/List_of_districts_of_Delhi', array[
    'Central Delhi','East Delhi','New Delhi','North Delhi','North East Delhi','North West Delhi',
    'Shahdara','South Delhi','South East Delhi','South West Delhi','West Delhi'
  ]::text[]),
  ('Puducherry', 'https://en.wikipedia.org/wiki/List_of_districts_of_Puducherry', array[
    'Puducherry','Karaikal','Mahe','Yanam'
  ]::text[]),
  ('Ladakh', 'https://en.wikipedia.org/wiki/List_of_districts_of_Ladakh', array[
    'Leh','Kargil'
  ]::text[]),
  ('Dadra and Nagar Haveli and Daman and Diu', 'https://en.wikipedia.org/wiki/Dadra_and_Nagar_Haveli_and_Daman_and_Diu', array[
    'Dadra and Nagar Haveli','Daman','Diu'
  ]::text[]),
  ('Andaman and Nicobar Islands', 'https://en.wikipedia.org/wiki/List_of_districts_of_Andaman_and_Nicobar_Islands', array[
    'Nicobar','North and Middle Andaman','South Andaman'
  ]::text[]),
  ('Chandigarh', 'https://en.wikipedia.org/wiki/Chandigarh', array['Chandigarh']::text[]),
  ('Lakshadweep', 'https://en.wikipedia.org/wiki/Lakshadweep', array['Lakshadweep']::text[])
) as s(state_name, url, names) on lower(state.name) = lower(s.state_name)
cross join lateral unnest(s.names) as d(name)
on conflict (state_id, lower(name)) do nothing;

commit;
