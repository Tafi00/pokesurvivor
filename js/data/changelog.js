/* ============ changelog.js — novedades del juego ============
 * Lo que ve la gente en el botón "Novedades" de la barra de arriba: cambios
 * de juego y fallos arreglados (nada de servidores ni bases de datos).
 * La fecha más nueva, arriba. En cada fecha, por apartados:
 *   new  lo nuevo · chg  cambios y ajustes · fix  fallos arreglados
 * Cada línea en español, inglés y vietnamita.
 */
G.CHANGELOG = [
  { d: '2026-10-13', title: ['La Sentencia de Arceus', 'The Judgment of Arceus', 'Phán Quyết của Arceus'], new: [
    ['La Sentencia de Arceus: al llegar al minuto 30, Arceus baja del cielo y te lleva a las Ruinas del Juicio. Es invencible, te persigue cada vez más deprisa y lanza pilares de luz, rayos y ondas; si te toca, te quita casi media vida. Cada 5 segundos acude un legendario con el doble de vida y de daño que el anterior. ¿Cuánto aguantarás?',
     'The Judgment of Arceus: at minute 30, Arceus descends from the sky and takes you to the Ruins of Judgment. It is invincible, chases you faster and faster and casts pillars of light, beams and shockwaves; if it touches you, you lose almost half your HP. Every 5 seconds a legendary joins, each with twice the HP and damage of the previous one. How long can you last?',
     'Phán Quyết của Arceus: khi đạt phút 30, Arceus giáng lâm từ bầu trời và đưa bạn tới Tàn Tích Phán Quyết. Arceus bất tử, truy đuổi ngày càng nhanh và tung cột sáng, tia năng lượng cùng sóng xung kích; chạm phải sẽ mất gần nửa cây máu. Mỗi 5 giây lại có thêm một Pokémon Huyền Thoại xuất hiện với máu và sát thương gấp đôi con trước. Bạn sẽ trụ được bao lâu?'],
    ['Tres logros nuevos: La Sentencia (llega al minuto 30), Ante el Creador (aguanta 1 minuto ante Arceus) y Desafío divino (derrota a 3 legendarios ante Arceus en una partida).',
     'Three new achievements: The Judgment (reach minute 30), Before the Creator (survive 1 minute against Arceus) and Divine challenge (defeat 3 legendaries against Arceus in a single run).',
     'Ba thành tựu mới: Phán Quyết (đạt phút 30), Trước Đấng Sáng Tạo (trụ vững 1 phút trước Arceus) và Thử thách thần thánh (hạ 3 Huyền Thoại trước mặt Arceus trong một lượt).'],
    ['Música nueva para la pelea contra Arceus.', 'New music for the fight against Arceus.', 'Nhạc nền chiến đấu mới dành riêng cho trận gặp Arceus.'],
    ['Botón para reportar marcas sospechosas en el ranking (la banderita de cada fila).',
     'A button to report suspicious records on the leaderboard (the little flag on each row).',
     'Nút báo cáo kỷ lục đáng ngờ trên bảng xếp hạng (biểu tượng lá cờ ở mỗi dòng).']
  ], chg: [
    ['El ranking histórico empieza de cero: ahora que las partidas acaban ante Arceus, las marcas de antes ya no se podrían alcanzar. Las tablas de hoy, de la semana y del mes siguen igual.',
     'The all-time leaderboard starts from scratch: now that runs end against Arceus, older records could no longer be reached. The daily, weekly and monthly boards are unchanged.',
     'Bảng xếp hạng mọi thời đại được làm mới: vì các lượt chơi giờ kết thúc trước Arceus, các kỷ lục cũ không thể vượt qua nữa. Bảng hôm nay, tuần này và tháng này giữ nguyên.'],
    ['Se quita el tiempo extra del minuto 60 (ya no se llega hasta ahí).',
     'Overtime from minute 60 is removed (runs no longer get that far).',
     'Loại bỏ hiệp phụ ở phút 60 (lượt chơi không còn kéo dài tới mốc đó).'],
    ['Desde el minuto 28 ya no se abren grietas, para que la Sentencia no te pille dentro de una.',
     'Rifts no longer open from minute 28 on, so the Judgment does not catch you inside one.',
     'Từ phút 28 trở đi sẽ không mở thêm Khe Nứt Không Gian để tránh bị Phán Quyết bắt gặp khi đang ở bên trong.'],
    ['Ranking protegido contra trampas: el servidor comprueba que cada marca se ha jugado de verdad. Nunca se pierde nada de lo que ganas jugando.',
     'Leaderboard protected against cheating: the server checks that every record was really played. You never lose anything you earn by playing.',
     'Bảo vệ bảng xếp hạng chống gian lận: máy chủ xác thực mỗi kỷ lục đều được chơi thật. Phần thưởng bạn kiếm được khi chơi luôn được bảo toàn.']
  ] },
  { d: '2026-10-12', title: ['Tiempo extra y grietas con menos azar', 'Overtime and less random rifts', 'Hiệp phụ & giảm may rủi Khe Nứt'], new: [
    ['Tiempo extra: desde el minuto 60 los Pokémon salvajes se vuelven cada vez más fuertes (más vida y más daño), y cada vez más deprisa. Antes, con las mejoras al máximo, algunas partidas no acababan nunca; ahora las mejores rondarán la hora y media.',
     'Overtime: from minute 60 on, wild Pokémon keep getting stronger (more HP and more damage), faster and faster. Before, with maxed upgrades, some runs never ended; now the best ones will last about an hour and a half.',
     'Hiệp phụ: từ phút 60 trở đi, Pokémon hoang dã mạnh lên nhanh chóng (nhiều máu và sát thương hơn).'],
    ['El juego se actualiza solo cuando sale una versión nueva: si estás en el menú, a los 5 segundos; si estás jugando, al acabar la partida (sin perder nada).',
     'The game now updates itself when a new version is out: within 5 seconds if you are in the menu, or after your run if you are playing (without losing anything).',
     'Tự động cập nhật khi có phiên bản mới: sau 5 giây nếu đang ở menu, hoặc ngay sau khi kết thúc lượt chơi mà không mất dữ liệu.'],
    ['Botón de Novedades (esta ventana) con todos los cambios del juego.',
     'A "What\'s new" button (this window) with every change to the game.',
     'Nút Bản cập nhật (cửa sổ này) tổng hợp mọi thay đổi của trò chơi.'],
    ['Números más fáciles de leer: el 2, el 5 y el 8 ya no se confunden.',
     'Easier to read numbers: 2, 5 and 8 no longer look alike.',
     'Phông chữ số rõ nét hơn: các số 2, 5 và 8 không còn dễ nhầm lẫn.'],
    ['Elige la versión normal o shiny de tu compañero desde el menú principal, debajo de él.',
     'Pick the normal or shiny version of your partner right from the main menu, under it.',
     'Chọn phiên bản thường hoặc Shiny cho đồng hành ngay tại menu chính.'],
    ['Mejoras nuevas para cada Pokémon: Golpe Crítico (+3 % de críticos por nivel, que hacen x1,5 de daño), Cambio de cartas (+1 cambio de las cartas de nivel por run) y Veto (bloquea movimientos para que no te salgan en las cartas; se eligen en Mejoras).',
     'New upgrades for each Pokémon: Critical Hit (+3% critical chance per level, crits deal x1.5 damage), Card reroll (+1 level-up card reroll per run) and Ban (block moves so they never show up in your cards; pick them in Upgrades).',
     'Nâng cấp mới cho từng Pokémon: Đòn Chí Mạng (+3% tỉ lệ chí mạng mỗi cấp, gây ×1,5 sát thương), Đổi Bài (+1 lượt đổi thẻ lên cấp mỗi trận) và Cấm Chiêu (chặn chiêu thức không muốn xuất hiện trong thẻ bài).'],
    ['Atajos de movimientos (en Mejoras, para cada Pokémon): elige qué movimiento va siempre en cada hueco, por ejemplo Confusión siempre en el 1, para la memoria muscular.',
     'Move shortcuts (in Upgrades, for each Pokémon): choose which move always goes in each slot, for example Confusion always on 1, for muscle memory.',
     'Phím tắt chiêu thức (trong mục Nâng cấp của từng Pokémon): gán cố định chiêu thức vào từng ô 1–4 để thuận tiện thao tác.']
  ], chg: [
    ['Avalancha hace menos daño (21 en vez de 26): derrotaba casi el doble que la media de los movimientos.',
     'Rock Slide deals less damage (21 instead of 26): it defeated almost twice as many as the average move.',
     'Lở Đá giảm sát thương cơ bản (21 thay vì 26) để cân bằng với các chiêu khác.'],
    ['Los cambios de cartas de nivel ya no se ganan venciendo jefes: tienes 1 gratis por run y el resto se compra en Mejoras.',
     'Level-up card rerolls are no longer earned by defeating bosses: you get 1 free per run and can buy more in Upgrades.',
     'Lượt đổi thẻ lên cấp không còn rơi từ Boss: bạn có 1 lượt miễn phí mỗi trận và có thể nâng cấp thêm trong mục Nâng cấp.'],
    ['Los legendarios de grieta ya no dan siempre tickets x10: dan uno la mitad de las veces (antes daban 2 siempre y salían demasiados).',
     'Rift legendaries no longer always drop x10 tickets: they drop one half of the time (they used to always drop 2, which was too many).',
     'Huyền Thoại trong Khe Nứt có 50% tỉ lệ rơi vé ×10 thay vì luôn rơi 2 vé như trước.'],
    ['Cooperativo: si vuestras redes no consiguen conectar entre sí, la sala lo avisa y lo reintenta sola, en vez de jugar a tirones por un servidor lento.',
     'Co-op: if your networks cannot connect to each other, the room says so and keeps retrying, instead of playing laggy through a slow server.',
     'Chơi nhóm: tự động thông báo và thử kết nối lại nếu mạng giữa các người chơi bị nghẽn.'],
    ['Hemos cambiado de servidores para que el juego siga siendo gratis: puede que tengas que volver a iniciar sesión (con la misma cuenta y contraseña, o con Google). Tu partida y tus Pokémon siguen igual.',
     'We moved to new servers so the game can stay free: you may need to sign in again (with the same account and password, or with Google). Your save and your Pokémon are unchanged.',
     'Chuyển đổi máy chủ để duy trì game miễn phí: dữ liệu lưu và bộ sưu tập Pokémon của bạn được giữ nguyên.'],
    ['Gacha: los shiny ya no salen repetidos. Si te toca uno que ya tienes, sale otro de la misma rareza que te falte.',
     'Gacha: shinies no longer come out as duplicates. If you roll one you already have, you get another of the same rarity that you are missing.',
     'Gacha: Pokémon Shiny không còn bị trùng lặp. Nếu quay trúng Shiny đã có, bạn sẽ nhận một Shiny khác cùng độ hiếm mà bạn chưa sở hữu.'],
    ['Grietas con menos azar: cada vez que no sale una, la siguiente es más probable (como mucho 2,5 minutos sin grieta).',
     'Less random rifts: every time one does not show up, the next one is more likely (at most 2.5 minutes without a rift).',
     'Khe Nứt ổn định hơn: tối đa 2,5 phút chắc chắn sẽ xuất hiện một Khe Nứt.'],
    ['Los legendarios que aún no has vencido salen 4 veces más en las grietas.',
     'Legendaries you have not beaten yet show up 4 times as often in rifts.',
     'Các Pokémon Huyền Thoại bạn chưa từng đánh bại sẽ có tỉ lệ xuất hiện cao gấp 4 lần trong Khe Nứt.'],
    ['Los curanderos curan más cuanto más fuerte pegas, pero cada vez menos y con un tope (como mucho el 2,5x).',
     'Healers heal more the harder you hit, but with diminishing returns and a cap (2.5x at most).',
     'Kẻ địch hồi máu được giới hạn mức hồi tối đa ở 2,5×.'],
    ['Ataques cuerpo a cuerpo más fuertes: mientras llevas uno activo recibes un 25 % menos de daño, llegan un 25 % más lejos y hacen un 20 % más de daño.',
     'Stronger melee attacks: while one is active you take 25% less damage, and they reach 25% further and deal 20% more damage.',
     'Tăng sức mạnh chiêu cận chiến: khi đang chọn chiêu cận chiến, bạn được giảm 25% sát thương nhận vào, tăng 25% tầm đánh và tăng 20% sát thương.'],
    ['Cooperativo: al elegir con qué objeto quedarte, la partida se para para todos (antes seguía y te pegaban mientras elegías).',
     'Co-op: choosing which held item to keep now pauses the run for everyone (it used to keep going and you got hit while choosing).',
     'Chơi nhóm: tạm dừng trận đấu cho cả đội khi có người đang chọn Trang bị.'],
    ['Cooperativo: mientras alguien elige una fusión, la partida se para para todos.',
     'Co-op: while someone is choosing a fusion, the run pauses for everyone.',
     'Chơi nhóm: tạm dừng trận đấu cho cả đội khi có người đang chọn Liên Kết chiêu thức.'],
    ['Cooperativo: si el anfitrión cambia de pestaña o se le para el juego, la partida se pausa para todos hasta que vuelva.',
     'Co-op: if the host switches tabs or their game stalls, the run pauses for everyone until they are back.',
     'Chơi nhóm: tự động tạm dừng nếu chủ phòng chuyển tab cho đến khi quay lại.'],
    ['Las runs de menos de 1 minuto ya no cuentan para el ranking.',
     'Runs shorter than 1 minute no longer count for the leaderboard.',
     'Các lượt chơi dưới 1 phút sẽ không được tính vào bảng xếp hạng.']
  ], fix: [
    ['Quitadas del ranking las marcas rotas por el fallo del minuto 84 (el reloj seguía corriendo con el juego parado) y alguna imposible. Si tenías una, tu próxima partida vuelve a contar.',
     'Removed broken records from the leaderboard caused by the minute 84 bug (the clock kept running while the game was frozen) and a few impossible ones. If you had one, your next run counts again.',
     'Đã dọn dẹp các kỷ lục lỗi trên bảng xếp hạng.'],
    ['iPhone (Safari y Chrome): a veces no se podía cambiar de movimiento tocando los iconos, sobre todo con el otro dedo en el joystick. Además los botones quedan por encima de la barra de inicio.',
     'iPhone (Safari and Chrome): sometimes you could not switch moves by tapping the icons, especially with your other finger on the joystick. Buttons also sit above the home bar now.',
     'iPhone (Safari và Chrome): sửa lỗi chạm đổi chiêu khi đang giữ joystick và nâng hàng nút lên trên thanh Home.'],
    ['En las partidas de más de 84 minutos la pantalla se quedaba en negro, el juego se paraba o empezabas a subir de nivel sin fin. Ya puedes jugar todo lo que aguantes.',
     'In runs longer than 84 minutes the screen went black, the game froze or you kept levelling up forever. Now you can play for as long as you survive.',
     'Sửa lỗi màn hình đen hoặc treo game trong các lượt chơi kéo dài.'],
    ['Si el juego fallara, la partida se cierra sola y se guarda (tiempo, derrotados, récords y ranking) en vez de perderse.',
     'If the game ever crashes, the run ends by itself and is saved (time, defeated, records and leaderboard) instead of being lost.',
     'Tự động lưu lại kết quả lượt chơi nếu chẳng may xảy ra sự cố.'],
    ['Las partidas muy largas a veces se tomaban por trampas y no contaban para el ranking.',
     'Very long runs were sometimes flagged as cheating and did not count for the leaderboard.',
     'Sửa lỗi các lượt chơi dài bị nhận diện nhầm là gian lận.'],
    ['Cooperativo: si el anfitrión cambiaba de pestaña, los enemigos se quedaban quietos y los demás jugaban con ventaja.',
     'Co-op: if the host switched tabs, enemies stood still and everyone else got a free advantage.',
     'Chơi nhóm: sửa lỗi kẻ địch đứng yên khi chủ phòng chuyển tab.'],
    ['iPhone: mantener el dedo en el joystick sacaba "Copiar / Seleccionar todo".',
     'iPhone: holding your finger on the joystick brought up "Copy / Select all".',
     'iPhone: tắt menu "Sao chép / Chọn tất cả" khi giữ ngón tay trên joystick.'],
    ['iPhone: a veces no salía la pantalla completa. Ahora el botón explica cómo tenerla (Compartir y "Añadir a pantalla de inicio").',
     'iPhone: fullscreen sometimes did not show up. Now the button explains how to get it (Share and "Add to Home Screen").',
     'iPhone: hướng dẫn mở toàn màn hình qua nút Chia sẻ → "Thêm vào Màn hình chính".']
  ] },
  { d: '2026-10-11', title: ['Vínculos', 'Bonds', 'Liên Kết Chiêu Thức'], new: [
    ['Vínculos: al vencer a un legendario fusionas movimientos que se lanzan a la vez desde un solo hueco (hasta 4).',
     'Bonds: defeating a legendary lets you fuse moves that fire at the same time from a single slot (up to 4).',
     'Liên Kết: đánh bại Pokémon Huyền Thoại cho phép hợp nhất các chiêu thức để tung ra cùng lúc từ một ô duy nhất (tối đa 4 chiêu).'],
    ['Botón para cambiar las cartas de subir de nivel.',
     'A button to reroll the level-up cards.',
     'Thêm nút đổi lại các thẻ bài khi lên cấp.']
  ], chg: [
    ['Más grietas.', 'More rifts.', 'Tăng tần suất xuất hiện Khe Nứt Không Gian.'],
    ['Movimientos psíquicos y curanderos más flojos.', 'Weaker psychic moves and healers.', 'Cân bằng lại chiêu hệ Tâm Linh và quái hồi máu.'],
    ['Las mejoras de las cartas de nivel (velocidad, recarga, experiencia, imán, coraza y potencia) tienen un tope de veces.',
     'Level-up card upgrades (speed, cooldown, experience, magnet, armor and power) can only be taken a limited number of times.',
     'Các thẻ nâng cấp chỉ số trong trận có giới hạn số lần cộng dồn tối đa.'],
    ['En el móvil, la ficha del Pokémon sale al lado; entrar es más rápido y el gacha x10 se puede cerrar.',
     'On mobile, the Pokémon details show alongside; logging in is faster and the x10 gacha can be closed.',
     'Trên điện thoại, bảng chi tiết Pokémon hiển thị ngay bên cạnh; đăng nhập nhanh hơn và có thể đóng nhanh Gacha ×10.']
  ], fix: [
    ['Pantalla negra en partidas de más de una hora por llenarse la memoria de imágenes.',
     'Black screen in runs longer than an hour because image memory filled up.',
     'Sửa lỗi tràn bộ nhớ ảnh đệm trong các trận kéo dài trên 1 giờ.'],
    ['Los tickets se perdían si se cerraba la pestaña antes de acabar la partida: ahora se guardan al cogerlos.',
     'Tickets were lost if the tab closed before the run ended: now they are saved as soon as you pick them up.',
     'Vé Gacha được lưu ngay lập tức khi nhặt được trong trận.'],
    ['Una mejora comprada justo después de guardar se cobraba y no se apuntaba.',
     'An upgrade bought right after saving was charged but not applied.',
     'Sửa lỗi mua nâng cấp ngay sau khi lưu.'],
    ['El juego se quedaba congelado para siempre si algo fallaba a mitad de partida.',
     'The game froze forever if something went wrong mid-run.',
     'Sửa lỗi treo game khi gặp sự cố giữa trận.']
  ] },
  { d: '2026-10-10', title: ['Más reto', 'More challenge', 'Thử thách cao hơn'], new: [
    ['Jefes y legendarios con 4 ataques avisados que se enfurecen a media vida.',
     'Bosses and legendaries with 4 telegraphed attacks that get enraged at half health.',
     'Boss và Huyền Thoại có 4 đòn tấn công cảnh báo trước và nổi giận khi còn nửa cây máu.'],
    ['12 movimientos nuevos y 8 formas de atacar nuevas: bumerán, cadena, minas, meteoros, torreta, embestida, rastro y abanico.',
     '12 new moves and 8 new ways to attack: boomerang, chain, mines, meteors, turret, dash, trail and spray.',
     '12 chiêu thức mới cùng 8 kiểu tấn công mới: boomerang, chuỗi sét, mìn, thiên thạch, trụ bắn, lướt húc, vệt độc và chùm đạn hình quạt.'],
    ['Eventos a mitad de partida (hordas de un tipo, hora dorada, Pokémon perdidos) y Meowth y Gholdengo que huyen cargados de monedas.',
     'Mid-run events (single-type hordes, golden hour, lost Pokémon) and Meowth and Gholdengo running away loaded with coins.',
     'Sự kiện giữa trận (bầy đàn đơn hệ, giờ vàng, giải cứu Pokémon bị lạc) cùng Meowth và Gholdengo mang đầy xu.'],
    ['Estatuas para los Pokémon grandes.', 'Statues for big Pokémon.', 'Tượng đá cho các Pokémon kích thước lớn.']
  ], chg: [
    ['Más difícil: menos enemigos pero más duros.', 'Harder: fewer but tougher enemies.', 'Độ khó cao hơn: ít quái hơn nhưng cứng cáp hơn.'],
    ['Subir de nivel es más lento, los tickets son más raros y los jefes dan ticket x10 una de cada tres veces.',
     'Levelling up is slower, tickets are rarer and bosses drop a x10 ticket one time in three.',
     'Tốc độ lên cấp cân bằng hơn, Boss có 1/3 cơ hội rơi vé Gacha ×10.'],
    ['Carga más rápida.', 'Faster loading.', 'Tối ưu tốc độ tải game nhanh hơn.']
  ], fix: [
    ['Los enemigos rezagados desaparecían delante de ti: ahora sólo fuera de la vista.',
     'Straggling enemies vanished in front of you: now only off-screen.',
     'Quái ở xa chỉ biến mất khi đã khuất khỏi màn hình.'],
    ['Los menús y pantallas se montaban encima de la barra de arriba.',
     'Menus and screens overlapped the top bar.',
     'Sửa lỗi giao diện đè lên thanh công cụ phía trên.']
  ] },
  { d: '2026-10-09', title: ['Móvil e inglés', 'Mobile and English', 'Hỗ trợ Di động & Đa ngôn ngữ'], new: [
    ['Se puede jugar en móvil y tablet con joystick táctil, e instalar como app.',
     'Play on phones and tablets with a touch joystick, and install it as an app.',
     'Hỗ trợ chơi trên điện thoại và máy tính bảng với joystick cảm ứng và cài đặt như ứng dụng.'],
    ['El juego, en español y en inglés.', 'The game in English and Spanish.', 'Hỗ trợ đa ngôn ngữ (Tiếng Việt, Tiếng Anh, Tiếng Tây Ban Nha).'],
    ['Pantalla de ajustes con calidad gráfica automática.', 'Settings screen with automatic graphics quality.', 'Màn hình cài đặt với chế độ chất lượng đồ họa tự động.']
  ], chg: [
    ['Menos enemigos en pantalla pero más fuertes.', 'Fewer but stronger enemies on screen.', 'Giảm số lượng quái trên màn hình nhưng tăng sức mạnh để mượt hơn.'],
    ['Gigadrenado pasa a ser Hierba Lazo (ya no cura).', 'Giga Drain becomes Grass Knot (no more healing).', 'Siêu Hấp Thụ đổi thành Dây Cỏ Trói Buộc.']
  ] },
  { d: '2026-10-08', title: ['Misiones, grietas y cooperativo', 'Missions, rifts and co-op', 'Nhiệm vụ, Khe Nứt & Chơi nhóm'], new: [
    ['Misiones diarias y semanales, logros con medallas y títulos, y perfil público.',
     'Daily and weekly missions, achievements with medals and titles, and a public profile.',
     'Nhiệm vụ hàng ngày và hàng tuần, thành tựu kèm huy chương, danh hiệu và hồ sơ công khai.'],
    ['Objetos equipables, evoluciones de movimientos y enemigos que curan, protegen, invocan o explotan.',
     'Held items, move evolutions and enemies that heal, shield, summon or explode.',
     'Trang bị mang theo, tiến hóa chiêu thức và các chủng quái biết hồi máu, tạo khiên, triệu hồi hoặc phát nổ.'],
    ['Grietas que llevan a 18 arenas legendarias, una por tipo, y clima que cambia la batalla.',
     'Rifts leading to 18 legendary arenas, one per type, and weather that changes the fight.',
     'Khe Nứt dẫn tới 18 đấu trường Huyền Thoại tương ứng 18 hệ cùng hiệu ứng thời tiết thay đổi cục diện trận đấu.'],
    ['Cooperativo con tu lista de amigos y ranking.', 'Co-op with your friends list and leaderboards.', 'Chế độ chơi nhóm cùng danh sách bạn bè và bảng xếp hạng.'],
    ['Mejoras para cada Pokémon, gacha tragaperras con tickets y tabla de tipos.',
     'Upgrades for each Pokémon, a slot-machine ticket gacha and a type chart.',
     'Nâng cấp riêng cho từng Pokémon, máy quay Gacha bằng vé và bảng tương khắc hệ.']
  ], chg: [
    ['Cámara más lejos y enemigos que rodean los obstáculos.', 'Camera further out and enemies that walk around obstacles.', 'Góc nhìn rộng hơn và quái biết đi vòng qua chướng ngại vật.']
  ] },
  { d: '2026-10-07', title: ['Primera versión', 'First version', 'Phiên bản đầu tiên'], new: [
    ['Primera versión pública de PokéSurvivor.', 'First public version of PokéSurvivor.', 'Phiên bản công khai đầu tiên của PokéSurvivor.']
  ] }
];
