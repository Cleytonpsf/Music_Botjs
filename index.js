const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const google = require("googleapis");
const fs = require("fs");
require("dotenv").config();

const bot = new Discord.Client();
const prefix = process.env.PREFIX;

const youtube = new google.youtube_v3.Youtube({
    version: "v3",
    auth: process.env.GOOGLE_KEY
});

const servers = [];

bot.login(process.env.TOKEN_DISCORD);

bot.on("guildCreate", (guild)=>{         //guilda é a mesma coisa que servidor
    console.log("Id da guilda: " + guild.id);
    console.log("Nome da guilda: " + guild.name);

    servers[guild.id] = {
        connection: null,
        dispatcher: null,
        queue: [],
        isPlaying: false,
        title: [],
        channel: []
    }

    saveServer(guild.id);
   
});

bot.on("ready", ()=>{
    console.log("Ready");
    loadServers();
})

async function playMusic(msg) {
    if(servers[msg.guild.id].isPlaying == false){
        const playing = servers[msg.guild.id].queue[0];
        servers[msg.guild.id].isPlaying = true;
        servers[msg.guild.id].dispatcher = servers[msg.guild.id].connection.play(ytdl(playing, {filter: "audioonly"}));
        servers[msg.guild.id].dispatcher.on("finish", ()=>{
            servers[msg.guild.id].queue.shift();
            servers[msg.guild.id].title.shift();
            servers[msg.guild.id].channel.shift();
            servers[msg.guild.id].isPlaying = false;
            if(servers[msg.guild.id].queue.length > 0)
                playMusic(msg);
            else
                servers[msg.guild.id].dispatcher = null;
        })
    }
}

const saveServer = (idNewServer) => {
    fs.readFile("serverList.json", "utf8", (err, data)=>{
        if(err){
            console.log("Erro ao ler o arquivo: " +err);
        }
        else{
            const readObj = JSON.parse(data);
            let op = false;
            if(readObj.servers.length == 0){
                readObj.servers.push(idNewServer);
                const writeObj = JSON.stringify(readObj)
                fs.writeFile("serverList.json", writeObj, "utf8", ()=>{});
            }else{
                for(let i in readObj.servers){
                    if(readObj.servers[i] == idNewServer){
                        return;
                    }else{
                        op = true;
                    }    
                }
                if(op){
                    isServers = true;
                    readObj.servers.push(idNewServer);
                    const writeObj = JSON.stringify(readObj)
                    fs.writeFile("serverList.json", writeObj, "utf8", ()=>{});
                }
            }
        }
    });
}

const loadServers = () => {
    fs.readFile("serverList.json", "utf8", (err, data)=>{
        if(err){
            console.log("Erro ao ler servidores: " +err);
        }
        else{
            const readObj = JSON.parse(data);
            for(let i in readObj.servers){
                servers[readObj.servers[i]] = {
                    connection: null,
                    dispatcher: null,
                    queue: [],
                    isPlaying: false,
                    title: [],
                    channel: []
                }
                
            }
        }
    });
}

bot.on("message", async msg =>{
    //filtros
    if(!msg.guild)
        return;
    if(!msg.content.startsWith(prefix))
        return;
    if(!msg.member.voice.channel){
        msg.reply("Entre em um canal de voz para usar os comandos!");
        return;
    }

    //comandos
    if(msg.content.startsWith(prefix + "play")){
        try {
            let url = msg.content.slice(6);
            if(url.length == 0)
                return msg.reply("Busque por alguma coisa");

            if(servers[msg.guild.id].connection == null)
                servers[msg.guild.id].connection = await msg.member.voice.channel.join();

            if(ytdl.validateURL(url)){
                let id = url.slice(32);
                youtube.search.list({
                    q: id,
                    part: "snippet",
                    fields: "items(id(videoId), snippet(title, channelTitle))",
                    type: "video"
                }, async function(err, result){
                    if(err)
                        console.log(err);
                    if(result){
                        const data = {
                            "title": result.data.items[0].snippet.title,
                            "channel": result.data.items[0].snippet.channelTitle,
                            "id": url
                        }
                        msg.channel.send(`**Música escolhida:** ${data.title} do canal ${data.channel}`);
                        servers[msg.guild.id].queue.push(data.id);
                        servers[msg.guild.id].title.push(data.title);
                        servers[msg.guild.id].channel.push(data.channel);
                        playMusic(msg);
                    }
                })
            }else{ 
                youtube.search.list({
                    q: url,
                    part: "snippet",
                    fields: "items(id(videoId), snippet(title, channelTitle))",
                    type: "video"
                }, async function(err, result){
                    if(err){
                        console.log(err);
                    }
                    if(result){
                        const listResult = [];
                        result.data.items.forEach(element => {
                            const dataItems = {
                                "title": element.snippet.title,
                                "channel": element.snippet.channelTitle,
                                "id": "https://www.youtube.com/watch?v="+element.id.videoId
                            }
                            listResult.push(dataItems);
                        });

                        const embed = new Discord.MessageEmbed()
                        .setColor([040,040,200])
                        .setAuthor("Music BotJs")
                        .setDescription("**Escolha a música! Clique em uma das Reações para escolher a música desejada**");

                        for(let i in listResult){
                            embed.addField(`${parseInt(i)+1}: ${listResult[i].title}`, `${listResult[i].channel}`);
                        }
                        msg.channel.send(embed).then(embedMessage =>{
                            const possibleReact = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"]
                            possibleReact.forEach(element=>{
                                embedMessage.react(element);
                            })
                            
                            const filter = (reaction, user) =>{
                                return possibleReact.includes(reaction.emoji.name) && 
                                user.id == msg.author.id;
                            }
                            embedMessage.awaitReactions(filter, {max: 1, time: 30000, erros: ["time"]})
                            .then(collected => {
                                const reaction = collected.first();
                                const idOption = possibleReact.indexOf(reaction.emoji.name);
                                msg.channel.send(`**Música escolhida:** ${listResult[idOption].title} do canal ${listResult[idOption].channel}`);
                                servers[msg.guild.id].queue.push(listResult[idOption].id);
                                servers[msg.guild.id].title.push(listResult[idOption].title);
                                servers[msg.guild.id].channel.push(listResult[idOption].channel);
                                playMusic(msg);
                            }).catch(err=>{
                                msg.reply("Opção inválida ou não escolhida");
                                console.log(err);
                            });
                        })
                    }
                });
            }    

        } catch (error) {
            console.log("Erro ao tentar conectar");
            console.log(error);
        }
    }

    else if(msg.content == prefix + "pause"){
        servers[msg.guild.id].dispatcher.pause();
    }

    else if(msg.content == prefix + "resume"){
        servers[msg.guild.id].dispatcher.resume();
    }

    else if(msg.content == prefix + "skip"){
        servers[msg.guild.id].dispatcher.end();
        playMusic(msg);
    }

    else if(msg.content == prefix + "list"){
        let list = [servers[msg.guild.id].title, servers[msg.guild.id].channel];
        let length = list[0].length;
        let title = list[0];
        let channel = list[1];
        const embed = new Discord.MessageEmbed()
                        .setColor([040,040,200])
                        .setAuthor("Music BotJs")
                        .setDescription("Músicas na Fila!");
        
        for(let i = 0; i<length; i++){
            embed.addField(`${i+1}: ${title[i]}`, `${channel[i]}`);
        }              
        msg.channel.send(embed);
    }

    else if(msg.content == prefix + "clear"){
        let length = servers[msg.guild.id].queue.length;
        while(length>1){
            servers[msg.guild.id].queue.pop();
            servers[msg.guild.id].title.pop();
            servers[msg.guild.id].channel.pop();
            length = length - 1;
        }
    }

    else if(msg.content == prefix + "leave"){
        msg.member.voice.channel.leave();
        servers[msg.guild.id].connection = null;
        servers[msg.guild.id].dispatcher = null;
        servers[msg.guild.id].queue = [];
        servers[msg.guild.id].isPlaying = false;
        servers[msg.guild.id].title = [];
        servers[msg.guild.id].channel = [];
    }

    else if(msg.content == prefix + "commands"){
        const commands = [
            { 
                title: "!play",
                body: "Digite !play e o nome ou link para escolher a música"
            },
            { 
                title: "!pause",
                body: "Digite !pause para pausar a música"
            },
            { 
                title: "!resume",
                body: "Digite !resume para dar play novamente na música"
            },
            { 
                title: "!skip",
                body: "Digite !skip para pular a música"
            },
            { 
                title: "!list",
                body: "Digite !list para ver todas as músicas que estão na fila"
            },
            {
                title: "!clear",
                body: "Digite !clear para remover todas as músicas da fila"
            },
            { 
                title: "!leave",
                body: "Digite !leave para desconectar o bot do canal"
            }
        ]
        const embed = new Discord.MessageEmbed()
                        .setColor([040,040,200])
                        .setAuthor("Music BotJs")
                        .setDescription("**Lista de comandos**");
        for(let i in commands){
            embed.addField(`${parseInt(i)+1}: ${commands[i].title}`, `${commands[i].body}`);
        }
        msg.channel.send(embed);
    }
    
    else if(msg.content.startsWith(prefix)){
        console.log("comando inválido");
        msg.reply("Comando inválido, caso queira acessar a lista de comandos digite !commands");
    }
})