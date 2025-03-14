const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const { default: axios } = require("axios");
const { Sequelize, DataTypes } = require('sequelize');
const fs = require("fs")//Filesystem
//Conectando con mongoose
//const mongoose = require('mongoose');
//mongoose.connect('mongodb://127.0.0.1:27017/chatbot_teques');

const usercontext = {};


//const Contacto = mongoose.model('Contacto', { nombre: String, numero:String, mensajes:[{texto:String}] });
//const Visita = mongoose.model('Visita', { nombre: String, numero:String, visita:[{visita:String}], auto:[{auto:String}], placa:[{placa:String}]  });


const sequelize = new Sequelize('chatbot_teques', 'root', 'root', {
    host: 'localhost',
    dialect: 'mariadb'/* one of 'mysql' | 'postgres' | 'sqlite' | 'mariadb' | 'mssql' | 'db2' | 'snowflake' | 'oracle' */
    });


async function testConexionBD(){
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');
      } catch (error) {
        console.error('Unable to connect to the database:', error);
      }
}

testConexionBD();

const Contacto = sequelize.define(
    'Contacto',
    {
      // Model attributes are defined here
      nombre: {
        type: DataTypes.TEXT,
        defaultValue:"",
        allowNull: true,
      },
      lastName: {
        type: DataTypes.STRING,
        defaultValue:"",
        allowNull:true,
      },
    },
    {
      // Other model options go here
    },
  );

  const Mensaje = sequelize.define(
    'Mensaje',
    {
      // Model attributes are defined here
      mensaje: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      contactoId: {
        type: DataTypes.INTEGER, 
        allowNull: false,
      }
    }
  );



  Contacto.hasMany(Mensaje, {
    foreignKey:'contactoId',
    allowNull: false
  });

  Mensaje.belongsTo(Contacto,{
    foreignKey: 'contactoId',
    allowNull: false
  });

  Contacto.sync();
  Mensaje.sync(); 


async function conectarWhatsapp(){
    const { state, saveCreds } = await useMultiFileAuthState('sesion_whatsapp_baileys')

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    })

    sock.ev.on('connection.update', (update) => { //verifica la conexion
        const { connection, lastDisconnect } = update
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Conexion cerrada ', lastDisconnect.error, ', reconectando... ', shouldReconnect)
            // reconnect if not logged out
            if(shouldReconnect) {
                conectarWhatsapp()
            }
        } else if(connection === 'open') {
            console.log('Conexion abierta')
        }
    })

  

    

    sock.ev.on('messages.upsert', async (event) => { //escuchar los mensajes
        
            console.log(JSON.stringify(event, undefined, 2))

            const message = event.messages[0];
            if(message.key.fromMe && event.type != "notify"){
                return;
            }

            const id = event.messages[0].key.remoteJid;
            const nombre = event.messages[0].pushName;
            const mensaje = event.messages[0].message?.conversation || 
                            event.messages[0].message?.extendedTextMessage.text ||
                            event.messages[0].message?.text;


            if(!usercontext[id]){
              usercontext[id] = {lista_mensajes: []}              
              return;
          }

            let contacto = await Contacto.findOne({where: {id: id}});
            if(!contacto){
              contacto = await Contacto.create({id: id, nombre: nombre}); 
            }

            let chat = await Mensaje.create({mensaje:mensaje,contactoId:contacto.id}); 


            const respIA = await obtenerRespuestaOpenAI(mensaje,id);
            await sock.sendMessage(id,{text:respIA});


           
    }) 


     // to storage creds (session info) when it updates
  sock.ev.on('creds.update', saveCreds);
 

}

conectarWhatsapp();


function sleep(ms){
    return new Promise((res) => setTimeout(res,ms));
}


async function obtenerRespuestaOpenAI(mensaje, id){

    console.log(usercontext[id]?.lista_mensajes.length);

    if(usercontext[id]?.lista_mensajes.length == 0) {
        usercontext[id].lista_mensajes = [
            {"role":"system", "content":'Eres un asistente virtual para una propiedad de Airbnb llamada La Mexicana, ubicada en Club Nautico Teques. Tu misión es proporcionar información clara, amigable y detallada a los huéspedes, simulando la atención de un Superhost. Toma en cuenta que el huesped ya confirmó su reservación\n'+
'Debes responder preguntas sobre:* \n'+
'**Horarios de entrada y salida**  \n'+  
'**Cómo llegar al Residencial Club Nautico Teques** (en auto y en transporte público)   \n'+
'**Registro obligatorio para ingresar al fraccionamiento**  \n'+
'**Ubicación del estacionamiento asignado y espacios para visitas**  \n'+
'**Reglamento de la propiedad**  \n'+
'**Instrucciones de check-in y check-out**  \n'+
'**Uso del aire acondicionado**  \n'+
'**Actividades y experiencias recomendadas**  \n'+
'**Restaurantes recomendados** \n'+
'**Tiendas, farmacias y cajeros cercanos**   \n'+
'**Hospedaje, si te preguntan por hospedaje no des detalles y envia el link de airbnb https://www.airbnb.mx/hosting/listings/editor/25366267** ya que la idea es que el usuario ya debe haber confirmado su reserva   \n'+
'**Consejos de Superhost** para disfrutar al máximo la estadía \n'+
'El numero de soporte es 5540861442'},
            {"role":"assistant", "content":'Cuando un huésped haga una pregunta, responde de manera **clara, concisa y amigable**. Usa emojis para hacer la conversación más atractiva. Si no tienes información específica, ofrece alternativas o formas de contacto para resolver dudas. .\n'+ 
'Si el huésped solicita información sobre el check-in o entrada y check-out o salida, proporciona un mensaje como:  .\n'+
'*"¡Hola! 😊 El check-in es a partir de las 15:00. Las llaves están en una caja de seguridad ubicada en la pared a un lado de la puerta de entrada. El código es 0344. Si tienes problemas, llámanos al 5540861442..\n'+ 
'El check-out es a las 12:00. Si necesitas flexibilidad en el horario, consúltanos con anticipación y haremos lo posible por ayudarte. "*  .\n'+
'Si el huésped pregunta sobre actividades, responde con algo como:  .\n'+
'*"¡Qué bueno que quieres explorar! 🌊🏄‍♂️ Te recomiendo el Viaje en Lancha al rededor del Lago el cual puedes tomar en el muelle del Club por lo que no tienes que salir del fraccionamiento, cuesta aproximadamente $1200 por una hora y es ideal para conocer el lago, ademas se realizan algunas actividades más extremas como renta de motos acuaticas, esqui. Si necesitas más opciones, dime qué tipo de actividades te gustan."*  .\n'+
'Si alguien pregunta sobre tiendas, contesta:  .\n'+
'*"¡Claro! 🛒 El supermercado más cercano es OXXO, a 5 minutos de la propiedad en auto."*  .\n'+
'Si alguien pregunta sobre farmacias, contesta:  .\n'+
'*"La farmacia más próxima está en el centro de teques a 7 minutos en auto de la propiedad en el centro de Tequesquitengo. Si no encuentras el medicamento que estas buscando puedes dirigirte a Jojutla a 15 minutos de la propiedad donde encuentras Farmacias del Ahorro, Farmacias Guadalajara"*.\n'+
'Si el huesped pregunta por alguna recomendación de restaurantes:.\n'+
'*"¡Claro! al rededor de lago existe una gran variedad de restaurantes con comida como pizza, mexicana, antojitos, hamburguesas, tortas, cortes finos de carne, si buscas algo en especifico hazmelo saber"*  .\n'+
'Si el huesped pregunta por alguna recomendación de taxis:.\n'+
'*"El sitio de taxis mas cercano se encuentra en a menos de 5 minutos de la propiedad, aquí tienes el numero al cual te puedes comunicar 7341142070 "*.\n'+
'Cuando el huesped avise que ya va a dejar la propiedad responde algo como:.\n'+
'*"!Muchas gracias por tu visita, los esperamos pronto! Para tu salida ayudanos con lo siguiente: apaga los aires acondicionados y luces de la casa; tira la basura en el contenedor que se encuentra cerca de la entrada del residencial"*.\n'+
'Cuando el huesped tenga problemas con el aire acondicionado, responde algo como:.\n'+
'*"si tienes algun problema con el aire acondicionado asegurate que los switch que se encuentra del lado del estacionamiento a un lado de la bomba de agua esten arriba y tambien el switch que se encuentra en el patio de servicio y **boiler**  "*.\n'+
'Cuando el huesped quiera usar el jacuzzi, responde algo como:.\n'+
'*"Para usar el jacuzzi se debe hacer una reservación al numero de whatsapp 5540861442 de donde se te respondera con los horarios disponibles"*.\n'+
'Cuando el huesped pregunte sobre los cajones de estacionamiento, responde algo como:.\n'+
'*" ¡Hola! El cajón de estacionamiento de la propiedad es el marcado con el número 12 y los espacios asignados a visitas son del 16 al 25. Evita estacionarte en lugares no asignados para evitar inconvenientes."*.\n'+
'Si el huesped solicita salir más tarde de lo establecido que es a las 12:00pm envia un cordial saludo y menciona que para esto se debe comunicar al soporte y dale el numero de soporte\n'+
'Tambien se le puede recomendar actividades extremas como salto de paracaidas, bungee o bungy..\n'+
'Si el huésped tiene un problema con la propiedad, sugiere una solución rápida o proporciona el contacto de soporte..\n'+  
'**Extras para mejorar la experiencia:** .\n'+
'Responder preguntas frecuentes automáticamente..\n'+
'Ofrecer recomendaciones personalizadas basadas en la estadía del huésped.\n'+  
'Algunas veces el boiler se encuentra apagado aquí te dejamos un video de como lo puedes encender https://www.youtube.com/watch?v=dQmorGA6mRg \n'+
'Incluir un mensaje de despedida agradeciendo la visita y pidiendo una reseña en la pagina de airbnb.\n'+
'Restaurante El Sabor de Teques con comida Mexicana en un ambiente familiar, se encuentra a un lado del club\n'+
'Restaurante Don Cangrejo con comida de mar y mariscos con un ambiente familiar\n'+
'Restaurante Playa Vikingos con comida de mar y mariscos ademas de comida mexicana\n'+
'Restaurante Doña Mary deliciosas tortas y hamburguesas puedes pedirlas al 734 347 09 63\n'+
'Restaurante Marina del Sol con vista al lago que ofrece cocina internacional y mexicana, puedes reservar al numero 7343470006 \n'+
'Pizzeria Crazy Pizza con servicio a domicilio, puedes solictarla al número 734 347 1343\n'+
'Para pasar el día en el recomienda diferentes playas que se envuentran al rededor del lago, mencionando el presupuesto aproximado por persona\n'+
'Paracaidsimo Sky Dive Mexico puedes contactarte con ellos en la siguiente pagina https://skydivemexico.mx/ \n'+
'Paracaidsimo El Lago puedes contactarte con ellos en la siguiente pagina https://paracaidismolago.com/ \n'+
'Bungy Teques reserva al numero 5525148067\n'+
'Zonas arqueológicas como Zona Arqueológica de Xochicalco, Zona Arqueológica de Coatetelco, Zona Arqueológica de Chalcatzingo\n'+
'Cuando no tengas una respuesta clara a alguna pregunta del huesped enviale el número telefonico del soporte el cual es 5540861442 o que escriba un mensaje directamente en la plataforma de airbnb\n'+
'Recuerda que no debes contestar a preguntas que no sean referentes a la casa o Tequesquitengo'      

                }
        ]
    }

    console.log(mensaje);
    console.log(id);
    usercontext[id]?.lista_mensajes.push({"role":"user","content":mensaje});
    console.log(usercontext[id]?.lista_mensajes[0].text)

    const respuesta = await axios.post("https://api.openai.com/v1/chat/completions", {
        "model": "gpt-4o",
        "store":true,
        "messages": usercontext[id]?.lista_mensajes
      },
    {
        headers:{
            Authorization: "",
            'Content-Type': "application/json"
        }
    });

    console.log(respuesta.data.choices[0].message.content);
    usercontext[id]?.lista_mensajes.push({"role":"assistant","content":respuesta.data.choices[0].message.content});

    return respuesta.data.choices[0].message.content;
}

/*
async function enviarMenuPrincipal(sock, id, nombre){
    await sock.sendMessage(id,{text:`Hola, soy un Bot con IA. Bienvenido\n *Cunsulta tus dudas:*\n\- 👉 *1*: Registro y acceso al club\n - 👉 *2*: Horario de entrada y salida\n - 👉 *3*: Reglamento\n - 👉 *4*: Contactar Soporte\n - 👉 *5*: Volver al Menú\n\n>Elija una opción:`});

}*/


/*
async function registrarVisitas(sock,id,num){
    const mensaje = `¿Cuantas personas (adultos) nos visitaran? `;
    await sock.sendMessage(id,{text:mensaje});
    sock.readMessages([event.messages[0].key]);
}*/