try:
    from playwright.sync_api import sync_playwright
    _PLAYWRIGHT_AVAILABLE = True
except ImportError:
    _PLAYWRIGHT_AVAILABLE = False
    def sync_playwright():  # noqa: E301
        raise RuntimeError("Playwright not installed. Run: pip install playwright && playwright install chromium")

from dataclasses import dataclass, asdict, field
import os
import time
import json
import re

@dataclass
class Business:
    name: str = None
    address: str = None
    website: str = None
    phone_number: str = None
    reviews_count: int = None
    reviews_average: float = None
    latitude: float = None
    longitude: float = None
    status: str = "New"
    notes: str = ""

@dataclass
class BusinessList:
    business_list: list[Business] = field(default_factory=list)

# ── City → Areas/Neighbourhoods (Worldwide) ───────────────────────────────────
CITY_AREAS = {

    # ── INDIA ─────────────────────────────────────────────────────────────────
    "jaipur": [
        "Malviya Nagar","Vaishali Nagar","Mansarovar","Pratap Nagar",
        "Raja Park","C-Scheme","Tonk Road","Ajmer Road","Sodala",
        "Sanganer","Murlipura","Jhotwara","Shastri Nagar","Nirman Nagar",
        "Durgapura","Lalkothi","Sitapura","Jagatpura","Vidyadhar Nagar",
        "Bapu Nagar","Triveni Nagar","Kanakpura","Kukas","Khatipura",
        "Adarsh Nagar","Sindhi Camp","Johari Bazar","Bani Park",
        "Gopalpura","New Sanganer Road","Tonk Phatak","Kartarpura",
        "Vidhyadhar Nagar","Ambabari","Imli Phatak","80 Feet Road",
    ],
    "delhi": [
        "Connaught Place","Lajpat Nagar","Saket","Dwarka","Rohini",
        "Pitampura","Janakpuri","Karol Bagh","Vasant Kunj","Greater Kailash",
        "South Extension","Defence Colony","Hauz Khas","Nehru Place",
        "Okhla","Shahdara","Preet Vihar","Mayur Vihar","Uttam Nagar",
        "Paschim Vihar","Rajouri Garden","Tilak Nagar","Laxmi Nagar",
        "Chandni Chowk","Katwaria Sarai","Munirka","RK Puram",
        "Dwarka Sector 10","Dwarka Sector 12","Patparganj","Geeta Colony",
    ],
    "new delhi": [
        "Connaught Place","Lajpat Nagar","Saket","Dwarka","Rohini",
        "Pitampura","Janakpuri","Karol Bagh","Vasant Kunj","Greater Kailash",
        "Hauz Khas","Nehru Place","Okhla","Chandni Chowk","RK Puram",
    ],
    "mumbai": [
        "Andheri West","Andheri East","Bandra West","Bandra East",
        "Borivali","Dadar","Kurla","Malad","Goregaon","Kandivali",
        "Thane","Powai","Vikhroli","Ghatkopar","Mulund","Worli",
        "Lower Parel","Chembur","Juhu","Santacruz","Khar",
        "Versova","Oshiwara","Jogeshwari","Mira Road","Navi Mumbai",
    ],
    "bangalore": [
        "Koramangala","Indiranagar","Whitefield","JP Nagar","Jayanagar",
        "BTM Layout","HSR Layout","Electronic City","Marathahalli",
        "Bellandur","Sarjapur Road","Banashankari","Rajajinagar",
        "Malleshwaram","Yelahanka","Hebbal","KR Puram","Bommanahalli",
        "Brookefield","Mahadevapura","Varthur","Domlur","Richmond Town",
    ],
    "bengaluru": [
        "Koramangala","Indiranagar","Whitefield","JP Nagar","Jayanagar",
        "BTM Layout","HSR Layout","Electronic City","Marathahalli","Bellandur",
    ],
    "hyderabad": [
        "Banjara Hills","Jubilee Hills","Madhapur","Gachibowli",
        "Kondapur","Hitech City","Begumpet","Secunderabad","Ameerpet",
        "Kukatpally","Miyapur","LB Nagar","Dilsukhnagar","Uppal",
        "Kompally","Bachupally","Alwal","Trimulgherry","Tarnaka",
    ],
    "chennai": [
        "Anna Nagar","T Nagar","Velachery","Adyar","Besant Nagar",
        "Nungambakkam","Perambur","Tambaram","Porur","Chromepet",
        "Sholinganallur","Mogappair","Ambattur","Guindy","OMR",
        "Thoraipakkam","Medavakkam","Pallikaranai","Perungudi",
    ],
    "pune": [
        "Koregaon Park","Viman Nagar","Wakad","Baner","Aundh",
        "Kothrud","Hadapsar","Kondhwa","Shivajinagar","Kharadi",
        "Magarpatta","Pimple Saudagar","Hinjewadi","Warje","Deccan",
        "Kalyani Nagar","Mundhwa","Fatima Nagar","Katraj","Ambegaon",
    ],
    "ahmedabad": [
        "Navrangpura","Satellite","Vastrapur","Maninagar","Bopal",
        "Prahlad Nagar","Chandkheda","Naroda","Gota","Thaltej",
        "Bodakdev","Paldi","Naranpura","SG Road","Ambawadi",
        "Vejalpur","Nikol","Odhav","Vatva","Isanpur",
    ],
    "kolkata": [
        "Park Street","Salt Lake","New Town","Howrah","Dum Dum",
        "Ballygunge","Behala","Kasba","Tollygunge","Jadavpur",
        "Rajarhat","Ultadanga","Sealdah","Burrabazar","Gariahat",
    ],
    "lucknow": [
        "Hazratganj","Gomti Nagar","Aliganj","Indira Nagar",
        "Rajajipuram","Alambagh","Chinhat","Vikas Nagar",
        "Mahanagar","Jankipuram","Vrindavan Yojana","Sushant Golf City",
    ],
    "surat": [
        "Adajan","Vesu","Athwalines","Katargam","Varachha",
        "Piplod","Pal","City Light","Bhatar","Althan",
    ],
    "nagpur": [
        "Dharampeth","Sadar","Sitabuldi","Ramdaspeth","Pratap Nagar",
        "Manish Nagar","Hingna","Wadi","Kamptee","Amravati Road",
    ],
    "indore": [
        "Vijay Nagar","Scheme 54","Palasia","MG Road","Rau",
        "Nipania","Bhawarkuan","Banganga","Old Palasia","Khandwa Road",
    ],
    "bhopal": [
        "MP Nagar","Arera Colony","Kolar Road","Bawadia Kalan",
        "Hoshangabad Road","Ayodhya Nagar","Piplani","Berasia Road",
    ],
    "chandigarh": [
        "Sector 17","Sector 22","Sector 34","Sector 35","Sector 43",
        "Sector 44","Panchkula","Mohali","Zirakpur","IT Park",
    ],
    "coimbatore": [
        "RS Puram","Gandhipuram","Saibaba Colony","Peelamedu",
        "Vadavalli","Singanallur","Thudiyalur","Hopes College",
    ],
    "visakhapatnam": [
        "Madhurawada","Gajuwaka","MVP Colony","Dwaraka Nagar",
        "Seethammadhara","Rushikonda","Bheemunipatnam",
    ],
    "kochi": [
        "Ernakulam","Kakkanad","Edapally","Aluva","Thevara",
        "Vyttila","Kaloor","MG Road","Marine Drive","Vytilla",
    ],

    # ── USA ───────────────────────────────────────────────────────────────────
    "new york": [
        "Manhattan","Brooklyn","Queens","Bronx","Staten Island",
        "Harlem","Upper East Side","Upper West Side","Midtown",
        "Lower Manhattan","SoHo","Tribeca","Chelsea","Greenwich Village",
        "East Village","Lower East Side","Williamsburg","Bushwick",
        "Astoria","Jackson Heights","Flushing","Jamaica","Ridgewood",
        "Bedford-Stuyvesant","Park Slope","Crown Heights","Flatbush",
        "Bay Ridge","Bensonhurst","Coney Island","Forest Hills",
    ],
    "new york city": [
        "Manhattan","Brooklyn","Queens","Bronx","Staten Island",
        "Harlem","Upper East Side","Midtown","Lower Manhattan","SoHo",
        "Williamsburg","Astoria","Flushing","Park Slope","Flatbush",
    ],
    "los angeles": [
        "Hollywood","Beverly Hills","Santa Monica","Venice Beach",
        "Downtown LA","Koreatown","Westwood","Silver Lake","Echo Park",
        "Los Feliz","Culver City","Inglewood","Pasadena","Glendale",
        "Burbank","Long Beach","Torrance","Compton","Boyle Heights",
        "Eagle Rock","Highland Park","Brentwood","Pacific Palisades",
        "Westchester","El Segundo","Hawthorne","Gardena",
    ],
    "chicago": [
        "Loop","Lincoln Park","Wicker Park","Bucktown","Lakeview",
        "Rogers Park","Hyde Park","Pilsen","Bridgeport","Wrigleyville",
        "Gold Coast","River North","Streeterville","Andersonville",
        "Edgewater","Uptown","Logan Square","Humboldt Park","Austin",
        "Oak Park","Evanston","Cicero","Berwyn","Schaumburg",
    ],
    "houston": [
        "Downtown","Midtown","Heights","Montrose","Galleria",
        "Medical Center","River Oaks","Sugar Land","Katy","Pearland",
        "The Woodlands","Spring","Humble","Pasadena","Baytown",
        "Clear Lake","Memorial","Bellaire","West University","Meyerland",
    ],
    "phoenix": [
        "Downtown","Scottsdale","Tempe","Mesa","Glendale",
        "Chandler","Gilbert","Peoria","Surprise","Avondale",
        "Goodyear","Ahwatukee","Arcadia","Biltmore","Camelback",
    ],
    "philadelphia": [
        "Center City","South Philly","North Philly","West Philly",
        "Fishtown","Northern Liberties","Manayunk","Chestnut Hill",
        "Germantown","Kensington","Frankford","Northeast Philadelphia",
    ],
    "san antonio": [
        "Downtown","Alamo Heights","Stone Oak","Helotes","Converse",
        "Universal City","Leon Valley","Pleasanton","New Braunfels",
        "Northside","Southside","Westside","Medical Center",
    ],
    "san diego": [
        "Downtown","Gaslamp Quarter","Mission Valley","Pacific Beach",
        "Ocean Beach","La Jolla","North Park","Hillcrest","Chula Vista",
        "El Cajon","Escondido","Santee","Poway","Encinitas","Carlsbad",
    ],
    "dallas": [
        "Downtown","Uptown","Deep Ellum","Oak Cliff","East Dallas",
        "North Dallas","Plano","Richardson","Garland","Irving",
        "Arlington","Grand Prairie","Denton","Frisco","McKinney",
    ],
    "san francisco": [
        "Downtown","SOMA","Mission District","Castro","Haight-Ashbury",
        "North Beach","Chinatown","Financial District","Marina","Pacific Heights",
        "Sunset District","Richmond District","Excelsior","Bayview","Potrero Hill",
    ],
    "seattle": [
        "Downtown","Capitol Hill","Fremont","Ballard","West Seattle",
        "South Seattle","Beacon Hill","Columbia City","Bellevue","Redmond",
        "Kirkland","Bothell","Renton","Kent","Federal Way","Auburn",
    ],
    "denver": [
        "Downtown","LoDo","Capitol Hill","Five Points","Curtis Park",
        "Congress Park","Wash Park","Cherry Creek","Aurora","Lakewood",
        "Westminster","Thornton","Arvada","Englewood","Highlands Ranch",
    ],
    "boston": [
        "Downtown","Back Bay","South End","Fenway","Jamaica Plain",
        "Roxbury","Dorchester","South Boston","Charlestown","East Boston",
        "Cambridge","Somerville","Brookline","Newton","Quincy",
    ],
    "las vegas": [
        "Strip","Downtown","Henderson","Summerlin","Green Valley",
        "Centennial Hills","North Las Vegas","Spring Valley","Enterprise",
        "Paradise","Whitney","Sunrise Manor","Winchester",
    ],
    "miami": [
        "Downtown","Brickell","Wynwood","Little Havana","Little Haiti",
        "Coral Gables","Coconut Grove","South Beach","North Miami",
        "Hialeah","Homestead","Kendall","Aventura","Doral",
    ],
    "atlanta": [
        "Downtown","Midtown","Buckhead","Decatur","Virginia-Highland",
        "Little Five Points","East Atlanta","Marietta","Smyrna","Sandy Springs",
        "Dunwoody","Roswell","Alpharetta","Peachtree City","Stockbridge",
    ],
    "austin": [
        "Downtown","East Austin","South Congress","Hyde Park","Bouldin Creek",
        "Travis Heights","Mueller","Cedar Park","Round Rock","Georgetown",
        "Pflugerville","Leander","Kyle","Buda","San Marcos",
    ],
    "washington dc": [
        "Capitol Hill","Georgetown","Dupont Circle","Adams Morgan","Logan Circle",
        "Columbia Heights","Shaw","Navy Yard","Northeast DC","Southeast DC",
        "Arlington","Alexandria","Bethesda","Silver Spring","Rockville",
    ],
    "minneapolis": [
        "Downtown","Uptown","Northeast","South Minneapolis","North Minneapolis",
        "St Paul","Bloomington","Eden Prairie","Plymouth","Maple Grove",
    ],
    "portland": [
        "Downtown","Pearl District","Northwest","Northeast","Southeast",
        "Hawthorne","Alberta Arts District","Beaverton","Gresham","Lake Oswego",
    ],
    "nashville": [
        "Downtown","East Nashville","Germantown","12 South","Gulch",
        "Midtown","West End","Antioch","Brentwood","Franklin","Murfreesboro",
    ],

    # ── UK ────────────────────────────────────────────────────────────────────
    "london": [
        "City of London","Westminster","Chelsea","Kensington","Notting Hill",
        "Shoreditch","Canary Wharf","Greenwich","Hackney","Islington",
        "Camden","Brixton","Croydon","Richmond","Wimbledon",
        "Fulham","Hammersmith","Shepherds Bush","Clapham","Battersea",
        "Peckham","Lewisham","Stratford","Ilford","Ealing",
        "Chiswick","Hounslow","Twickenham","Kingston","Tooting",
        "Wandsworth","Putney","Wembley","Harrow","Barnet",
    ],
    "manchester": [
        "City Centre","Salford","Trafford","Didsbury","Chorlton",
        "Fallowfield","Withington","Levenshulme","Rusholme","Ancoats",
        "Stockport","Bury","Bolton","Oldham","Rochdale",
    ],
    "birmingham": [
        "City Centre","Edgbaston","Moseley","Solihull","Sutton Coldfield",
        "Sparkhill","Small Heath","Selly Oak","Kings Heath","Hall Green",
        "Erdington","Perry Barr","Handsworth","West Bromwich","Wolverhampton",
    ],
    "leeds": [
        "City Centre","Headingley","Chapel Allerton","Roundhay","Horsforth",
        "Kirkstall","Burley","Hyde Park","Harehills","Beeston",
    ],
    "glasgow": [
        "City Centre","West End","Southside","East End","Finnieston",
        "Merchant City","Govan","Pollokshields","Shawlands","Partick",
    ],
    "edinburgh": [
        "Old Town","New Town","Leith","Morningside","Bruntsfield",
        "Stockbridge","Marchmont","Portobello","Corstorphine","Gilmerton",
    ],
    "bristol": [
        "City Centre","Clifton","Redland","Southville","Bedminster",
        "Stokes Croft","Easton","St George","Henleaze","Bishopston",
    ],
    "liverpool": [
        "City Centre","Toxteth","Kensington","Anfield","Walton",
        "Aigburth","Allerton","Wavertree","West Derby","Birkenhead",
    ],

    # ── AUSTRALIA ─────────────────────────────────────────────────────────────
    "sydney": [
        "CBD","Surry Hills","Newtown","Glebe","Pyrmont",
        "Darlinghurst","Redfern","Paddington","Bondi","Coogee",
        "Manly","North Sydney","Chatswood","Parramatta","Blacktown",
        "Penrith","Liverpool","Campbelltown","Hornsby","Sutherland",
        "Balmain","Leichhardt","Marrickville","Mascot","Zetland",
    ],
    "melbourne": [
        "CBD","Fitzroy","Collingwood","Richmond","South Yarra",
        "Prahran","St Kilda","Brunswick","Carlton","Northcote",
        "Thornbury","Footscray","Williamstown","Brighton","Caulfield",
        "Clayton","Box Hill","Doncaster","Ringwood","Frankston",
        "Dandenong","Craigieburn","Sunbury","Werribee","Geelong",
    ],
    "brisbane": [
        "CBD","South Brisbane","West End","Fortitude Valley","Newstead",
        "New Farm","Teneriffe","Hamilton","Chermside","Carindale",
        "Capalaba","Sunnybank","Indooroopilly","Toowong","Ipswich",
    ],
    "perth": [
        "CBD","Fremantle","Subiaco","Leederville","Mount Lawley",
        "Northbridge","Victoria Park","Cannington","Midland","Joondalup",
        "Rockingham","Mandurah","Armadale","Stirling","Wanneroo",
    ],
    "adelaide": [
        "CBD","North Adelaide","Norwood","Glenelg","Port Adelaide",
        "Prospect","Unley","Salisbury","Tea Tree Gully","Marion",
    ],

    # ── CANADA ────────────────────────────────────────────────────────────────
    "toronto": [
        "Downtown","Midtown","North York","Scarborough","Etobicoke",
        "East York","York","Mississauga","Brampton","Markham",
        "Vaughan","Richmond Hill","Oakville","Pickering","Ajax",
        "Kensington Market","Annex","Leslieville","Danforth","Bloor West",
    ],
    "vancouver": [
        "Downtown","West End","Gastown","Kitsilano","Commercial Drive",
        "Mount Pleasant","Fairview","West Vancouver","North Vancouver",
        "Burnaby","Richmond","Surrey","Langley","Coquitlam","Abbotsford",
    ],
    "montreal": [
        "Downtown","Plateau Mont-Royal","Mile End","Old Montreal","Rosemont",
        "Notre-Dame-de-Grâce","Verdun","LaSalle","Laval","Longueuil",
        "Westmount","Outremont","Villeray","Hochelaga","Saint-Laurent",
    ],
    "calgary": [
        "Downtown","Beltline","Kensington","Inglewood","Mission",
        "Bridgeland","Sunnyside","Forest Lawn","Shawnessy","Airdrie",
    ],
    "ottawa": [
        "Downtown","Centretown","Glebe","Westboro","Hintonburg",
        "Vanier","Kanata","Orleans","Barrhaven","Nepean",
    ],
    "edmonton": [
        "Downtown","Whyte Ave","Glenora","Bonnie Doon","Mill Woods",
        "West Edmonton","Sherwood Park","St Albert","Spruce Grove",
    ],

    # ── UAE ───────────────────────────────────────────────────────────────────
    "dubai": [
        "Deira","Bur Dubai","Karama","JBR","Downtown Dubai",
        "Business Bay","Dubai Marina","Al Barsha","Jumeirah",
        "Discovery Gardens","Sports City","Silicon Oasis","Mirdif",
        "Al Quoz","Satwa","Oud Metha","Muhaisnah","International City",
        "Jumeirah Lake Towers","Dubai Hills","Arabian Ranches","Motor City",
    ],
    "abu dhabi": [
        "Downtown","Al Reem Island","Khalidiyah","Corniche","Mussafah",
        "Al Ain","Yas Island","Saadiyat Island","Khalifa City","Mohamed Bin Zayed City",
    ],
    "sharjah": [
        "Al Nahda","Rolla","Al Qasimia","Muwailih","Al Khan",
        "Industrial Area","Al Majaz","Al Taawun",
    ],

    # ── SINGAPORE ─────────────────────────────────────────────────────────────
    "singapore": [
        "Orchard","Marina Bay","Clarke Quay","Bugis","Toa Payoh",
        "Tampines","Jurong","Woodlands","Ang Mo Kio","Bedok",
        "Punggol","Sengkang","Bishan","Serangoon","Yishun",
        "Hougang","Pasir Ris","Clementi","Queenstown","Buona Vista",
    ],

    # ── GERMANY ───────────────────────────────────────────────────────────────
    "berlin": [
        "Mitte","Prenzlauer Berg","Friedrichshain","Kreuzberg","Neukölln",
        "Charlottenburg","Schöneberg","Steglitz","Zehlendorf","Pankow",
        "Spandau","Wedding","Tempelhof","Reinickendorf","Treptow",
    ],
    "munich": [
        "Altstadt","Schwabing","Maxvorstadt","Haidhausen","Neuhausen",
        "Sendling","Giesing","Trudering","Bogenhausen","Pasing",
    ],
    "hamburg": [
        "Altona","Eimsbüttel","Harburg","Wandsbek","Bergedorf",
        "St Pauli","HafenCity","Blankenese","Rahlstedt","Lurup",
    ],
    "frankfurt": [
        "Sachsenhausen","Bornheim","Nordend","Westend","Bockenheim",
        "Gallus","Fechenheim","Höchst","Praunheim","Niederrad",
    ],

    # ── FRANCE ────────────────────────────────────────────────────────────────
    "paris": [
        "1st Arrondissement","2nd Arrondissement","3rd Arrondissement",
        "4th Arrondissement","5th Arrondissement","6th Arrondissement",
        "7th Arrondissement","8th Arrondissement","9th Arrondissement",
        "10th Arrondissement","11th Arrondissement","12th Arrondissement",
        "13th Arrondissement","14th Arrondissement","15th Arrondissement",
        "16th Arrondissement","17th Arrondissement","18th Arrondissement",
        "Montmartre","Marais","Saint-Germain","Bastille","Belleville",
        "Versailles","Saint-Denis","Vincennes","Boulogne-Billancourt",
    ],

    # ── NETHERLANDS ───────────────────────────────────────────────────────────
    "amsterdam": [
        "Centrum","Jordaan","De Pijp","Oud-Zuid","Oud-West",
        "Noord","Oost","Nieuw-West","Bijlmer","Bos en Lommer",
    ],

    # ── SPAIN ─────────────────────────────────────────────────────────────────
    "madrid": [
        "Centro","Salamanca","Malasaña","Chueca","Lavapiés",
        "Chamberí","Retiro","Arganzuela","Carabanchel","Vallecas",
        "Getafe","Alcalá de Henares","Leganés","Alcorcón","Móstoles",
    ],
    "barcelona": [
        "Gothic Quarter","Eixample","Gràcia","Barceloneta","Poble Sec",
        "Sant Martí","Sants","Nou Barris","Sant Andreu","Sarrià",
        "Hospitalet","Badalona","Terrassa","Sabadell","Mataró",
    ],

    # ── ITALY ─────────────────────────────────────────────────────────────────
    "rome": [
        "Trastevere","Prati","Pigneto","Testaccio","Monteverde",
        "Esquilino","Parioli","EUR","Ostia","Tiburtino",
    ],
    "milan": [
        "Brera","Navigli","Isola","Porta Romana","City Life",
        "Porta Venezia","Sempione","Lambrate","Sesto San Giovanni","Monza",
    ],

    # ── JAPAN ─────────────────────────────────────────────────────────────────
    "tokyo": [
        "Shibuya","Shinjuku","Harajuku","Akihabara","Asakusa",
        "Ginza","Roppongi","Shimokitazawa","Nakameguro","Ikebukuro",
        "Ueno","Koenji","Kichijoji","Yokohama","Kawasaki",
    ],
    "osaka": [
        "Namba","Shinsaibashi","Umeda","Tennoji","Shinsekai",
        "Dotonbori","Tsuruhashi","Sakaisuji","Kyobashi","Yodogawa",
    ],

    # ── SOUTH EAST ASIA ───────────────────────────────────────────────────────
    "bangkok": [
        "Sukhumvit","Silom","Siam","Chatuchak","Lat Phrao",
        "Nonthaburi","Min Buri","Bang Na","Phra Khanong","Thonburi",
    ],
    "kuala lumpur": [
        "KLCC","Bukit Bintang","Chow Kit","Bangsar","Petaling Jaya",
        "Subang Jaya","Puchong","Cheras","Ampang","Kepong",
        "Sri Petaling","Setapak","Wangsa Maju","Batu Caves",
    ],
    "jakarta": [
        "Sudirman","Kuningan","Kemang","Kebayoran Baru","Menteng",
        "Tanah Abang","Glodok","Kelapa Gading","Cikini","Semanggi",
    ],
    "ho chi minh city": [
        "District 1","District 3","Binh Thanh","District 7","Go Vap",
        "Tan Binh","Binh Duong","Thu Duc","Nha Be",
    ],

    # ── SOUTH AFRICA ──────────────────────────────────────────────────────────
    "johannesburg": [
        "Sandton","Rosebank","Melville","Soweto","Fourways",
        "Randburg","Midrand","Centurion","Boksburg","Springs",
    ],
    "cape town": [
        "CBD","Green Point","Sea Point","Camps Bay","Claremont",
        "Wynberg","Mitchells Plain","Bellville","Stellenbosch","Somerset West",
    ],

    # ── MIDDLE EAST ───────────────────────────────────────────────────────────
    "riyadh": [
        "Al Olaya","Al Malaz","Sulaimania","Al Hamra","Al Nakheel",
        "Al Aqiq","Al Wurud","Al Rawdah","Al Naseem","Al Hazm",
    ],
    "doha": [
        "West Bay","The Pearl","Al Sadd","Al Wakra","Al Rayyan",
        "Lusail","Muaither","Ain Khalid","Old Airport","Madinat Khalifa",
    ],
    "kuwait city": [
        "Salmiya","Hawalli","Farwaniya","Rumaithiya","Mangaf",
        "Fahaheel","Sabah Al-Salem","Mishref","Salwa","Jahra",
    ],

    # ── NEW ZEALAND ───────────────────────────────────────────────────────────
    "auckland": [
        "CBD","Ponsonby","Newmarket","Remuera","Mt Eden",
        "Parnell","Devonport","Takapuna","Manukau","Henderson",
    ],
}

# City aliases (handles slight name variations)
CITY_ALIASES = {
    "new york city": "new york",
    "nyc": "new york",
    "la": "los angeles",
    "dc": "washington dc",
    "washington": "washington dc",
    "bengaluru": "bangalore",
    "bombay": "mumbai",
    "calcutta": "kolkata",
    "madras": "chennai",
    "hcmc": "ho chi minh city",
}

# Country aliases
COUNTRY_ALIASES = {
    "united states": "usa",
    "us": "usa",
    "u.s.": "usa",
    "u.s.a.": "usa",
    "united kingdom": "uk",
    "great britain": "uk",
    "england": "uk",
    "uae": "uae",
    "united arab emirates": "uae",
    "south korea": "korea",
}

# city_key → geographic metadata for scoped searches
CITY_META: dict[str, dict] = {
    # India
    "jaipur":       {"country": "india", "country_display": "India", "state": "Rajasthan",       "display": "Jaipur",       "lat": 26.9124, "lng": 75.7873},
    "delhi":        {"country": "india", "country_display": "India", "state": "Delhi",             "display": "Delhi",        "lat": 28.6139, "lng": 77.2090},
    "new delhi":    {"country": "india", "country_display": "India", "state": "Delhi",             "display": "New Delhi",    "lat": 28.6139, "lng": 77.2090},
    "mumbai":       {"country": "india", "country_display": "India", "state": "Maharashtra",       "display": "Mumbai",       "lat": 19.0760, "lng": 72.8777},
    "bangalore":    {"country": "india", "country_display": "India", "state": "Karnataka",         "display": "Bangalore",    "lat": 12.9716, "lng": 77.5946},
    "bengaluru":    {"country": "india", "country_display": "India", "state": "Karnataka",         "display": "Bengaluru",    "lat": 12.9716, "lng": 77.5946},
    "hyderabad":    {"country": "india", "country_display": "India", "state": "Telangana",         "display": "Hyderabad",    "lat": 17.3850, "lng": 78.4867},
    "chennai":      {"country": "india", "country_display": "India", "state": "Tamil Nadu",        "display": "Chennai",      "lat": 13.0827, "lng": 80.2707},
    "pune":         {"country": "india", "country_display": "India", "state": "Maharashtra",       "display": "Pune",         "lat": 18.5204, "lng": 73.8567},
    "ahmedabad":    {"country": "india", "country_display": "India", "state": "Gujarat",           "display": "Ahmedabad",    "lat": 23.0225, "lng": 72.5714},
    "kolkata":      {"country": "india", "country_display": "India", "state": "West Bengal",       "display": "Kolkata",      "lat": 22.5726, "lng": 88.3639},
    "lucknow":      {"country": "india", "country_display": "India", "state": "Uttar Pradesh",     "display": "Lucknow",      "lat": 26.8467, "lng": 80.9462},
    "surat":        {"country": "india", "country_display": "India", "state": "Gujarat",           "display": "Surat",        "lat": 21.1702, "lng": 72.8311},
    "nagpur":       {"country": "india", "country_display": "India", "state": "Maharashtra",       "display": "Nagpur",       "lat": 21.1458, "lng": 79.0882},
    "indore":       {"country": "india", "country_display": "India", "state": "Madhya Pradesh",    "display": "Indore",       "lat": 22.7196, "lng": 75.8577},
    "bhopal":       {"country": "india", "country_display": "India", "state": "Madhya Pradesh",    "display": "Bhopal",       "lat": 23.2599, "lng": 77.4126},
    "chandigarh":   {"country": "india", "country_display": "India", "state": "Chandigarh",        "display": "Chandigarh",   "lat": 30.7333, "lng": 76.7794},
    "coimbatore":   {"country": "india", "country_display": "India", "state": "Tamil Nadu",        "display": "Coimbatore",   "lat": 11.0168, "lng": 76.9558},
    "visakhapatnam":{"country": "india", "country_display": "India", "state": "Andhra Pradesh",    "display": "Visakhapatnam","lat": 17.6868, "lng": 83.2185},
    "kochi":        {"country": "india", "country_display": "India", "state": "Kerala",            "display": "Kochi",        "lat": 9.9312,  "lng": 76.2673},
    # USA
    "new york":     {"country": "usa", "country_display": "USA", "state": "New York",      "display": "New York",     "lat": 40.7128, "lng": -74.0060},
    "los angeles":  {"country": "usa", "country_display": "USA", "state": "California",    "display": "Los Angeles",  "lat": 34.0522, "lng": -118.2437},
    "chicago":      {"country": "usa", "country_display": "USA", "state": "Illinois",      "display": "Chicago",      "lat": 41.8781, "lng": -87.6298},
    "houston":      {"country": "usa", "country_display": "USA", "state": "Texas",         "display": "Houston",      "lat": 29.7604, "lng": -95.3698},
    "phoenix":      {"country": "usa", "country_display": "USA", "state": "Arizona",       "display": "Phoenix",      "lat": 33.4484, "lng": -112.0740},
    "philadelphia": {"country": "usa", "country_display": "USA", "state": "Pennsylvania",  "display": "Philadelphia", "lat": 39.9526, "lng": -75.1652},
    "san antonio":  {"country": "usa", "country_display": "USA", "state": "Texas",         "display": "San Antonio",  "lat": 29.4241, "lng": -98.4936},
    "san diego":    {"country": "usa", "country_display": "USA", "state": "California",    "display": "San Diego",    "lat": 32.7157, "lng": -117.1611},
    "dallas":       {"country": "usa", "country_display": "USA", "state": "Texas",         "display": "Dallas",       "lat": 32.7767, "lng": -96.7970},
    "san francisco":{"country": "usa", "country_display": "USA", "state": "California",    "display": "San Francisco","lat": 37.7749, "lng": -122.4194},
    "seattle":      {"country": "usa", "country_display": "USA", "state": "Washington",    "display": "Seattle",      "lat": 47.6062, "lng": -122.3321},
    "denver":       {"country": "usa", "country_display": "USA", "state": "Colorado",      "display": "Denver",       "lat": 39.7392, "lng": -104.9903},
    "boston":       {"country": "usa", "country_display": "USA", "state": "Massachusetts", "display": "Boston",       "lat": 42.3601, "lng": -71.0589},
    "las vegas":    {"country": "usa", "country_display": "USA", "state": "Nevada",        "display": "Las Vegas",    "lat": 36.1699, "lng": -115.1398},
    "miami":        {"country": "usa", "country_display": "USA", "state": "Florida",       "display": "Miami",        "lat": 25.7617, "lng": -80.1918},
    "atlanta":      {"country": "usa", "country_display": "USA", "state": "Georgia",       "display": "Atlanta",      "lat": 33.7490, "lng": -84.3880},
    "austin":       {"country": "usa", "country_display": "USA", "state": "Texas",         "display": "Austin",       "lat": 30.2672, "lng": -97.7431},
    "washington dc":{"country": "usa", "country_display": "USA", "state": "DC",            "display": "Washington DC","lat": 38.9072, "lng": -77.0369},
    "minneapolis":  {"country": "usa", "country_display": "USA", "state": "Minnesota",     "display": "Minneapolis",  "lat": 44.9778, "lng": -93.2650},
    "portland":     {"country": "usa", "country_display": "USA", "state": "Oregon",        "display": "Portland",     "lat": 45.5152, "lng": -122.6784},
    "nashville":    {"country": "usa", "country_display": "USA", "state": "Tennessee",     "display": "Nashville",    "lat": 36.1627, "lng": -86.7816},
    # UK
    "london":       {"country": "uk", "country_display": "UK", "state": "England", "display": "London",     "lat": 51.5074, "lng": -0.1278},
    "manchester":   {"country": "uk", "country_display": "UK", "state": "England", "display": "Manchester", "lat": 53.4808, "lng": -2.2426},
    "birmingham":   {"country": "uk", "country_display": "UK", "state": "England", "display": "Birmingham", "lat": 52.4862, "lng": -1.8904},
    "leeds":        {"country": "uk", "country_display": "UK", "state": "England", "display": "Leeds",      "lat": 53.8008, "lng": -1.5491},
    "glasgow":      {"country": "uk", "country_display": "UK", "state": "Scotland","display": "Glasgow",    "lat": 55.8642, "lng": -4.2518},
    "edinburgh":    {"country": "uk", "country_display": "UK", "state": "Scotland","display": "Edinburgh",  "lat": 55.9533, "lng": -3.1883},
    "bristol":      {"country": "uk", "country_display": "UK", "state": "England", "display": "Bristol",    "lat": 51.4545, "lng": -2.5879},
    "liverpool":    {"country": "uk", "country_display": "UK", "state": "England", "display": "Liverpool",  "lat": 53.4084, "lng": -2.9916},
    # Australia
    "sydney":       {"country": "australia", "country_display": "Australia", "state": "NSW", "display": "Sydney",    "lat": -33.8688, "lng": 151.2093},
    "melbourne":    {"country": "australia", "country_display": "Australia", "state": "VIC", "display": "Melbourne", "lat": -37.8136, "lng": 144.9631},
    "brisbane":     {"country": "australia", "country_display": "Australia", "state": "QLD", "display": "Brisbane",  "lat": -27.4698, "lng": 153.0251},
    "perth":        {"country": "australia", "country_display": "Australia", "state": "WA",  "display": "Perth",     "lat": -31.9505, "lng": 115.8605},
    "adelaide":     {"country": "australia", "country_display": "Australia", "state": "SA",  "display": "Adelaide",  "lat": -34.9285, "lng": 138.6007},
    # Canada
    "toronto":      {"country": "canada", "country_display": "Canada", "state": "Ontario",     "display": "Toronto",  "lat": 43.6532, "lng": -79.3832},
    "vancouver":    {"country": "canada", "country_display": "Canada", "state": "BC",          "display": "Vancouver","lat": 49.2827, "lng": -123.1207},
    "montreal":     {"country": "canada", "country_display": "Canada", "state": "Quebec",      "display": "Montreal", "lat": 45.5017, "lng": -73.5673},
    "calgary":      {"country": "canada", "country_display": "Canada", "state": "Alberta",     "display": "Calgary",  "lat": 51.0447, "lng": -114.0719},
    "ottawa":       {"country": "canada", "country_display": "Canada", "state": "Ontario",     "display": "Ottawa",   "lat": 45.4215, "lng": -75.6972},
    "edmonton":     {"country": "canada", "country_display": "Canada", "state": "Alberta",     "display": "Edmonton", "lat": 53.5461, "lng": -113.4938},
    # UAE
    "dubai":        {"country": "uae", "country_display": "UAE", "state": "Dubai", "display": "Dubai",     "lat": 25.2048, "lng": 55.2708},
    "abu dhabi":    {"country": "uae", "country_display": "UAE", "state": "Abu Dhabi", "display": "Abu Dhabi","lat": 24.4539, "lng": 54.3773},
    "sharjah":      {"country": "uae", "country_display": "UAE", "state": "Sharjah", "display": "Sharjah",  "lat": 25.3463, "lng": 55.4209},
    # Other
    "singapore":    {"country": "singapore", "country_display": "Singapore", "state": None, "display": "Singapore", "lat": 1.3521, "lng": 103.8198},
    "berlin":       {"country": "germany", "country_display": "Germany", "state": "Berlin", "display": "Berlin", "lat": 52.5200, "lng": 13.4050},
    "munich":       {"country": "germany", "country_display": "Germany", "state": "Bavaria", "display": "Munich", "lat": 48.1351, "lng": 11.5820},
    "hamburg":      {"country": "germany", "country_display": "Germany", "state": "Hamburg", "display": "Hamburg", "lat": 53.5511, "lng": 9.9937},
    "frankfurt":    {"country": "germany", "country_display": "Germany", "state": "Hesse", "display": "Frankfurt", "lat": 50.1109, "lng": 8.6821},
    "paris":        {"country": "france", "country_display": "France", "state": "Île-de-France", "display": "Paris", "lat": 48.8566, "lng": 2.3522},
    "amsterdam":    {"country": "netherlands", "country_display": "Netherlands", "state": None, "display": "Amsterdam", "lat": 52.3676, "lng": 4.9041},
    "madrid":       {"country": "spain", "country_display": "Spain", "state": "Madrid", "display": "Madrid", "lat": 40.4168, "lng": -3.7038},
    "barcelona":    {"country": "spain", "country_display": "Spain", "state": "Catalonia", "display": "Barcelona", "lat": 41.3851, "lng": 2.1734},
    "rome":         {"country": "italy", "country_display": "Italy", "state": "Lazio", "display": "Rome", "lat": 41.9028, "lng": 12.4964},
    "milan":        {"country": "italy", "country_display": "Italy", "state": "Lombardy", "display": "Milan", "lat": 45.4642, "lng": 9.1900},
    "tokyo":        {"country": "japan", "country_display": "Japan", "state": "Tokyo", "display": "Tokyo", "lat": 35.6762, "lng": 139.6503},
    "osaka":        {"country": "japan", "country_display": "Japan", "state": "Osaka", "display": "Osaka", "lat": 34.6937, "lng": 135.5023},
    "bangkok":      {"country": "thailand", "country_display": "Thailand", "state": None, "display": "Bangkok", "lat": 13.7563, "lng": 100.5018},
    "kuala lumpur": {"country": "malaysia", "country_display": "Malaysia", "state": None, "display": "Kuala Lumpur", "lat": 3.1390, "lng": 101.6869},
    "jakarta":      {"country": "indonesia", "country_display": "Indonesia", "state": None, "display": "Jakarta", "lat": -6.2088, "lng": 106.8456},
    "ho chi minh city": {"country": "vietnam", "country_display": "Vietnam", "state": None, "display": "Ho Chi Minh City", "lat": 10.8231, "lng": 106.6297},
    "johannesburg": {"country": "south africa", "country_display": "South Africa", "state": "Gauteng", "display": "Johannesburg", "lat": -26.2041, "lng": 28.0473},
    "cape town":    {"country": "south africa", "country_display": "South Africa", "state": "Western Cape", "display": "Cape Town", "lat": -33.9249, "lng": 18.4241},
    "riyadh":       {"country": "saudi arabia", "country_display": "Saudi Arabia", "state": None, "display": "Riyadh", "lat": 24.7136, "lng": 46.6753},
    "doha":         {"country": "qatar", "country_display": "Qatar", "state": None, "display": "Doha", "lat": 25.2854, "lng": 51.5310},
    "kuwait city":  {"country": "kuwait", "country_display": "Kuwait", "state": None, "display": "Kuwait City", "lat": 29.3759, "lng": 47.9774},
    "auckland":     {"country": "new zealand", "country_display": "New Zealand", "state": None, "display": "Auckland", "lat": -36.8485, "lng": 174.7633},
}

# country_key → cities inside that country (city → sectors inside city)
COUNTRY_CITIES: dict[str, list[str]] = {}
for _city, _meta in CITY_META.items():
    COUNTRY_CITIES.setdefault(_meta["country"], [])
    if _city not in COUNTRY_CITIES[_meta["country"]]:
        COUNTRY_CITIES[_meta["country"]].append(_city)

COUNTRY_DISPLAY = {
    "india": "India", "usa": "USA", "uk": "UK", "australia": "Australia",
    "canada": "Canada", "uae": "UAE", "singapore": "Singapore",
    "germany": "Germany", "france": "France", "netherlands": "Netherlands",
    "spain": "Spain", "italy": "Italy", "japan": "Japan", "thailand": "Thailand",
    "malaysia": "Malaysia", "indonesia": "Indonesia", "vietnam": "Vietnam",
    "south africa": "South Africa", "saudi arabia": "Saudi Arabia",
    "qatar": "Qatar", "kuwait": "Kuwait", "new zealand": "New Zealand",
}


@dataclass
class SearchTask:
    query: str
    city: str | None = None
    country: str | None = None
    state: str | None = None
    lat: float | None = None
    lng: float | None = None


def _word_in_text(word: str, text: str) -> bool:
    return bool(re.search(r'\b' + re.escape(word) + r'\b', text, re.IGNORECASE))


def get_city_meta(city_key: str) -> dict:
    if city_key in CITY_META:
        return CITY_META[city_key]
    return {
        "country": None, "country_display": "", "state": None,
        "display": city_key.title(), "lat": None, "lng": None,
    }


def detect_country(text: str) -> str | None:
    q = text.lower().strip()
    for alias, canonical in sorted(COUNTRY_ALIASES.items(), key=lambda x: -len(x[0])):
        if _word_in_text(alias, q):
            return canonical
    for country in COUNTRY_CITIES:
        if _word_in_text(country, q) or _word_in_text(COUNTRY_DISPLAY.get(country, ""), q):
            return country
    return None


def extract_coordinates_from_url(url: str) -> tuple[float, float]:
    try:
        coordinates = url.split('/@')[-1].split('/')[0]
        return float(coordinates.split(',')[0]), float(coordinates.split(',')[1])
    except Exception:
        return None, None


def detect_city(query: str) -> str | None:
    """Find the best matching city in the query string (word-boundary match)."""
    q = query.lower()
    for alias, canonical in sorted(CITY_ALIASES.items(), key=lambda x: -len(x[0])):
        if _word_in_text(alias, q):
            return canonical
    best = None
    best_len = 0
    for city in CITY_AREAS:
        if _word_in_text(city, q) and len(city) > best_len:
            best = city
            best_len = len(city)
    return best


def format_scoped_query(biz_type: str, city_key: str, area: str | None = None) -> str:
    """Build a disambiguated query: biz in Area, City, State, Country."""
    meta = get_city_meta(city_key)
    location_parts = []
    if area:
        location_parts.append(area)
    location_parts.append(meta["display"])
    if meta.get("state"):
        location_parts.append(meta["state"])
    if meta.get("country_display"):
        location_parts.append(meta["country_display"])
    return f"{biz_type} in {', '.join(location_parts)}"


def _city_search_tasks(biz_type: str, city_key: str, expand_areas: bool) -> list[SearchTask]:
    """City search, then sector-by-sector inside that city only."""
    meta = get_city_meta(city_key)
    tasks = [SearchTask(
        query=format_scoped_query(biz_type, city_key),
        city=city_key,
        country=meta.get("country"),
        state=meta.get("state"),
        lat=meta.get("lat"),
        lng=meta.get("lng"),
    )]
    if expand_areas and city_key in CITY_AREAS:
        for area in CITY_AREAS[city_key]:
            tasks.append(SearchTask(
                query=format_scoped_query(biz_type, city_key, area=area),
                city=city_key,
                country=meta.get("country"),
                state=meta.get("state"),
                lat=meta.get("lat"),
                lng=meta.get("lng"),
            ))
    return tasks


def build_search_queue(original_query: str, total: int,
                       scope: str = "city") -> list[SearchTask]:
    """
    Build scoped search tasks:
      - city scope:    search city, then sectors inside that city only
      - country scope: search each city in the country, then its sectors
    """
    parts = re.split(r'\s+in\s+', original_query, maxsplit=1, flags=re.IGNORECASE)
    biz_type = parts[0].strip()
    location_text = parts[1].strip() if len(parts) > 1 else original_query
    expand_areas = total > 20

    country = detect_country(location_text) if scope == "country" else None
    city = detect_city(location_text) or detect_city(original_query)

    if scope == "country" and country and country in COUNTRY_CITIES:
        tasks: list[SearchTask] = []
        for city_key in COUNTRY_CITIES[country]:
            tasks.extend(_city_search_tasks(biz_type, city_key, expand_areas))
        return tasks

    if city and city in CITY_AREAS:
        return _city_search_tasks(biz_type, city, expand_areas)

    meta = get_city_meta(city) if city else {}
    return [SearchTask(
        query=original_query,
        city=city,
        country=meta.get("country"),
        state=meta.get("state"),
        lat=meta.get("lat"),
        lng=meta.get("lng"),
    )]


def build_maps_search_url(task: SearchTask) -> str:
    """Google Maps URL with coordinate bias so results stay in the target area."""
    encoded = task.query.replace(" ", "+")
    if task.lat is not None and task.lng is not None:
        return f"https://www.google.com/maps/search/{encoded}/@{task.lat},{task.lng},13z"
    return f"https://www.google.com/maps/search/{encoded}"


def address_matches_scope(address: str, task: SearchTask) -> bool:
    """Reject results from other cities/countries."""
    if not address:
        return False
    addr = address.lower()

    if task.city:
        city_meta = get_city_meta(task.city)
        city_names = {task.city, city_meta["display"].lower()}
        if not any(_word_in_text(name, addr) for name in city_names):
            return False

        if task.country == "india":
            state = (task.state or "").lower()
            if state and not _word_in_text(state, addr) and "india" not in addr:
                return False
        elif task.country:
            country_display = COUNTRY_DISPLAY.get(task.country, task.country).lower()
            country_hints = {
                "usa": ["usa", "united states"],
                "uk": ["uk", "united kingdom", "england", "scotland", "wales"],
                "uae": ["uae", "united arab emirates", "dubai", "emirates"],
            }
            hints = country_hints.get(task.country, [country_display])
            if not any(h in addr for h in hints):
                return False

        other_cities = [
            c for c in CITY_AREAS
            if c != task.city and get_city_meta(c).get("country") == task.country
        ]
        for other in other_cities:
            if _word_in_text(other, addr) and not _word_in_text(task.city, addr):
                return False

    return True


# ── Global job state ──────────────────────────────────────────────────────────
JOB_STATES: dict = {}


def check_state(job_id: str) -> bool:
    """Returns True if job should stop."""
    state = JOB_STATES.get(job_id, {}).get('status', 'stopped')
    while state == 'paused':
        time.sleep(1)
        state = JOB_STATES.get(job_id, {}).get('status', 'stopped')
    return state == 'stopped'


def log(job_id: str, msg: str):
    if job_id not in JOB_STATES:
        return
    JOB_STATES[job_id]['progress'] = msg
    JOB_STATES[job_id].setdefault('log', []).append(msg)


def run_scraper(job_id: str, search_list: list[str], total: int,
                output_folder: str = "output", no_website_only: bool = False,
                location_scope: str = "city"):
    if not search_list:
        return []

    # Playwright's sync API spawns a browser subprocess, which on Windows needs a
    # Proactor event loop. When the scraper runs in a worker thread under the ASGI
    # server the thread can inherit a Selector loop policy, causing the browser
    # transport to fail with NotImplementedError. Force a Proactor loop here.
    import sys
    import asyncio
    if sys.platform == "win32":
        try:
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
            asyncio.set_event_loop(asyncio.new_event_loop())
        except Exception:
            pass

    if not _PLAYWRIGHT_AVAILABLE:
        if job_id in JOB_STATES:
            JOB_STATES[job_id]["status"] = "error"
            JOB_STATES[job_id]["progress"] = (
                "Playwright not installed. "
                "Run: pip install playwright && playwright install chromium"
            )
        return []

    JOB_STATES[job_id] = {
        'status': 'running',
        'progress': 'Initializing...',
        'data': [],
        'log': [],
        'found': 0,
        'target': total,
        'current_area': '',
    }

    try:
        with sync_playwright() as p:
            log(job_id, "Launching Chromium browser...")
            browser = p.chromium.launch(headless=False)
            page = browser.new_page()

            for search_index, original_query in enumerate(search_list):
                if check_state(job_id):
                    break

                safe_name = re.sub(r'[^a-zA-Z0-9_]', '_', original_query)
                file_path = os.path.join(output_folder, f"{safe_name}.json")

                existing_data: list[dict] = []
                seen_businesses: set[str] = set()
                if os.path.exists(file_path):
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            existing_data = json.load(f)
                        for b in existing_data:
                            seen_businesses.add(f"{b.get('name','')}|{b.get('address','')}")
                    except Exception:
                        pass

                total_extracted = len(existing_data)
                full_queue = build_search_queue(
                    original_query, total, scope=location_scope)

                scope_label = "country → cities → sectors" if location_scope == "country" else "city → sectors"
                log(job_id,
                    f"[Query {search_index+1}/{len(search_list)}] '{original_query}' "
                    f"({scope_label}) → {len(full_queue)} scoped searches  (target: {total})")

                for q_idx, task in enumerate(full_queue):
                    if check_state(job_id):
                        break
                    if total_extracted >= total:
                        log(job_id, f"  Target {total} reached!")
                        break

                    query = task.query
                    JOB_STATES[job_id]['current_area'] = query
                    log(job_id,
                        f"  [{q_idx+1}/{len(full_queue)}] Searching: '{query}' "
                        f"| Have {total_extracted}/{total}")

                    direct_url = build_maps_search_url(task)
                    page.goto(direct_url, wait_until="domcontentloaded", timeout=60000)
                    page.wait_for_timeout(4000)

                    for sel in [
                        'button[aria-label="Accept all"]',
                        'button:has-text("Accept all")',
                        'button:has-text("I agree")',
                        'button[jsname="higCR"]',
                    ]:
                        try:
                            btn = page.locator(sel).first
                            if btn.count():
                                btn.click()
                                page.wait_for_timeout(1000)
                                break
                        except Exception:
                            pass

                    if check_state(job_id):
                        break

                    needed = total - total_extracted
                    previously_counted = 0
                    stall = 0

                    while True:
                        if check_state(job_id):
                            break
                        try:
                            page.evaluate(
                                'document.querySelector(\'[role="feed"]\').scrollBy(0, 10000)'
                            )
                        except Exception:
                            page.mouse.wheel(0, 10000)
                        page.wait_for_timeout(2000)

                        current = page.locator(
                            '//a[contains(@href, "https://www.google.com/maps/place")]'
                        ).count()
                        log(job_id, f"    Visible: {current}  |  Need: {needed}")

                        if current >= needed:
                            break
                        if current == previously_counted:
                            stall += 1
                            if stall >= 3:
                                break
                            page.wait_for_timeout(2000)
                        else:
                            previously_counted = current
                            stall = 0

                    if check_state(job_id):
                        break

                    all_links = page.locator(
                        '//a[contains(@href, "https://www.google.com/maps/place")]'
                    ).all()
                    listings = [l.locator("xpath=..") for l in all_links[:needed]]

                    log(job_id, f"    Extracting details for {len(listings)} listings...")

                    new_businesses = BusinessList()

                    for i, listing in enumerate(listings):
                        if check_state(job_id):
                            break
                        if total_extracted >= total:
                            break

                        log(job_id,
                            f"    [{i+1}/{len(listings)}] Extracting... "
                            f"Total so far: {total_extracted}/{total}")

                        try:
                            listing.click()
                            page.wait_for_timeout(3500)

                            biz = Business()
                            biz.name = listing.get_attribute('aria-label') or ""

                            addr_xpath  = '//button[@data-item-id="address"]//div[contains(@class,"fontBodyMedium")]'
                            web_xpath   = '//a[@data-item-id="authority"]//div[contains(@class,"fontBodyMedium")]'
                            phone_xpath = '//button[contains(@data-item-id,"phone:tel:")]//div[contains(@class,"fontBodyMedium")]'
                            rc_xpath    = '//button[@jsaction="pane.reviewChart.moreReviews"]//span'
                            ra_xpath    = '//div[@jsaction="pane.reviewChart.moreReviews"]//div[@role="img"]'

                            biz.address = (
                                page.locator(addr_xpath).all()[0].inner_text()
                                if page.locator(addr_xpath).count() > 0 else ""
                            )

                            if not address_matches_scope(biz.address, task):
                                log(job_id,
                                    f"    Skipped (outside scope): {biz.name} — {biz.address[:50]}")
                                continue

                            key = f"{biz.name}|{biz.address}"
                            if key in seen_businesses:
                                log(job_id, f"    Skipped duplicate: {biz.name}")
                                continue
                            seen_businesses.add(key)

                            biz.website = (
                                page.locator(web_xpath).all()[0].inner_text()
                                if page.locator(web_xpath).count() > 0 else ""
                            )
                            if no_website_only and biz.website:
                                log(job_id, f"    Skipped (has website): {biz.name}")
                                continue

                            biz.phone_number = (
                                page.locator(phone_xpath).all()[0].inner_text()
                                if page.locator(phone_xpath).count() > 0 else ""
                            )
                            if page.locator(rc_xpath).count() > 0:
                                biz.reviews_count = int(
                                    page.locator(rc_xpath).inner_text()
                                    .split()[0].replace(',', '').strip()
                                )
                            if page.locator(ra_xpath).count() > 0:
                                biz.reviews_average = float(
                                    page.locator(ra_xpath)
                                    .get_attribute('aria-label')
                                    .split()[0].replace(',', '.').strip()
                                )
                            biz.latitude, biz.longitude = extract_coordinates_from_url(page.url)

                            new_businesses.business_list.append(biz)
                            total_extracted += 1
                            JOB_STATES[job_id]['data'].append(asdict(biz))
                            JOB_STATES[job_id]['found'] = total_extracted
                            log(job_id,
                                f"    → +1  Have {total_extracted}/{total}  [{biz.name[:40]}]")

                        except Exception as e:
                            log(job_id, f"    Error on listing: {e}")

                    combined = existing_data + [asdict(b) for b in new_businesses.business_list]
                    existing_data = combined
                    os.makedirs(output_folder, exist_ok=True)
                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump(combined, f, indent=4, ensure_ascii=False)

                    log(job_id,
                        f"  Saved. Progress for '{original_query}': "
                        f"{total_extracted}/{total}")

                log(job_id,
                    f"Finished '{original_query}': {total_extracted} leads collected.")

            browser.close()

    except Exception as e:
        log(job_id, f"Fatal error: {e}")
        JOB_STATES[job_id]['status'] = 'error'
        return

    if JOB_STATES[job_id]['status'] != 'error':
        log(job_id, "All queries completed.")
        JOB_STATES[job_id]['status'] = 'completed'
