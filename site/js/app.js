var OWI = angular.module('OWI', ['ui.bootstrap'])

// Setup some angular config stuff
OWI.config(['$compileProvider', function($compileProvider) {
   $compileProvider.debugInfoEnabled(false); // more perf
}])

OWI.directive("fileread", [function () {
  return {
    scope: {
      fileread: "="
    },
    link: function (scope, element) {
      element.bind("change", function (changeEvent) {
        var reader = new FileReader()
        reader.onload = function (loadEvent) {
          scope.$apply(function () {
            scope.fileread(loadEvent.target.result)
          })
        }
        reader.readAsDataURL(changeEvent.target.files[0])
      })
    }
  }
}])

OWI.controller('MainCtrl', ["$http", "$scope", function($http, $scope) {
  const vm = this;
  const audio = window.audio
  const download = window.download
  const fileInput = window.fileInput
  const baseUrl = 'https://js41637.github.io/Overwatch-Item-Tracker/data'

  var loading = true
  this.looping = false
  this.hero = undefined
  this.sounds = {}
  this.items = {}
  this.heroes = []
  this.mappedSounds = {}
  this.selectedItems = {}
  this.sSound = undefined
  this.sSoundIndex = -1
  this.showSelectedFiles = false
  this.noSounds = false

  const getSoundData = () => {
    return $http.get('./data/soundFiles.json').then(resp => {
      if (resp.status == 200) {
        var heroes = Object.keys(resp.data)
        return { heroes: heroes, hero: heroes[0], sounds: resp.data }
      } else {
        console.error("Failed loading soundFiles.json ???", resp.status, resp.error);
        Promise.reject("Failed loading soundFiles.json ???")
      }
    }, function(resp) {
      console.error("Failed loading soundFiles.json ???", resp.status, resp.error);
      Promise.reject("Failed loading soundFiles.json ???")
    })
  }

  const getItemsAndMappedData = () => {
    return Promise.all(['items', 'mappedSounds', 'customSounds'].map((what, i) => {
      var url = !i ? `${baseUrl}/${what}` : `./data/${what}`
      return $http.get(`${url}.json`).then(resp => {
        if (resp.status == 200) {
          return resp.data
        } else {
          console.error("Failed loading items.json and/or mappedSounds.json ???", resp.status, resp.error);
          Promise.reject("Failed loading items.json and/or mappedSounds.json ???")
        }
      }, function(resp) {
        console.error("Failed loading items.json and/or mappedSounds.json ???", resp.status, resp.error);
        Promise.reject("Failed loading items.json and/or mappedSounds.json ???")
      })
    }))
  }

  const init = () => {
    Promise.all([getSoundData(), getItemsAndMappedData()]).then(([soundData, [items, mappedSounds, customSounds]]) => {
      console.log('Loaded data')
      soundData.heroes = soundData.heroes.concat(Object.keys(customSounds))
      Object.assign(soundData.sounds, customSounds)
      Object.assign(vm, {
        items
      }, soundData)
      vm.importData(mappedSounds, true)
      loading = false;
      $scope.$digest()
    })
  }

  this.selectHero = hero => {
    this.hero = hero
    this.sSoundIndex = -1
  }

  function hashCode(str) {
    var hash = 0
    for (var i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }
    return hash
  } 

  function intToRGB(i ){
    var c = (i & 0x00FFFFFF).toString(16).toUpperCase()
    return "00000".substring(0, 6 - c.length) + c
  }

  function shadeColor(color, percent) {   
    var f=parseInt(color,16),t=percent<0?0:255,p=percent<0?percent*-1:percent,R=f>>16,G=f>>8&0x00FF,B=f&0x0000FF;
    return "#"+(0x1000000+(Math.round((t-R)*p)+R)*0x10000+(Math.round((t-G)*p)+G)*0x100+(Math.round((t-B)*p)+B)).toString(16).slice(1);
}

  this.getColorForTS = str => {
    if (!str) return ''
    return shadeColor(intToRGB(hashCode(str)), 0.6)
  }

  this.isHeroDone = hero => {
    if (loading) return false
    if (!this.mappedSounds[hero]) return false
    if (Object.keys(this.mappedSounds[hero] || {}).length == this.items[hero].items.voicelines.length) return true
    return false    
  }

  this.getVLCount = () => {
    if (loading) return '0/0'
    if (!this.items[this.hero]) return ''
    return Object.keys(this.mappedSounds[this.hero] || {}).length + '/' + this.items[this.hero].items.voicelines.length
  }

  this.toggleSelectedFiles = () => {
    this.showSelectedFiles = !this.showSelectedFiles
  }

  this.clearItem = itemID => {
    var soundID = this.selectedItems[itemID]
    delete this.mappedSounds[this.hero][soundID]
    delete this.selectedItems[itemID]
  }

  this.selectItem = itemID => {   
    if (this.selectedItems[itemID]) {
      this.playSound(this.selectedItems[itemID], null, true)
      return
    }
    if (!this.sSound) return
    this.mappedSounds[this.hero] = this.mappedSounds[this.hero] || {}
    if (this.mappedSounds[this.hero][this.sSound]) return
    this.mappedSounds[this.hero][this.sSound] = itemID
    this.selectedItems[itemID] = this.sSound
  }

  this.saveData = () => {
    download(JSON.stringify(this.mappedSounds, null, 2), `mappedSounds-${Date.now()}.json`, 'application/json');
  }

  this.clearData = () => {
    this.mappedSounds = {}
    this.selectedItems = {}
  }

  this.importData = (data, internal) => {
    fileInput.value = null
    var savedData = internal ? data : undefined
    if (!internal) {
      try {
        savedData = JSON.parse(atob(data.replace('data:;base64,', '')))
      } catch(e) {
        console.log("Error")
        return
      }
    }

    Object.keys(savedData).forEach(hero => {
      if (!vm.mappedSounds[hero]) vm.mappedSounds[hero] = {}
      Object.assign(vm.mappedSounds[hero], savedData[hero])
      Object.keys(savedData[hero]).forEach(sound => {
        vm.selectedItems[savedData[hero][sound]] = sound
      })
    })
  }

  this.toggleLoop = () => {
    this.looping = !this.looping
    audio.loop = this.looping
    if (this.looping) this.replaySound()
  }

  this.handleKeyPress = event => {
    const keyCode = event.keyCode.toString()
    if (keyCode.match(/(40|39|38|37)/)) {
      event.preventDefault()
      vm.selectNextSound(keyCode)
      return
    }
    if (keyCode == 13) {
      event.preventDefault()
      vm.replaySound()
    }
  }

  this.getItemName = (sound, tooltip) => {
    if (loading || (tooltip && this.showSelectedFiles) || (!tooltip && !this.showSelectedFiles)) return ''
    if (!this.mappedSounds[vm.hero]) return ''
    var item = this.mappedSounds[vm.hero][sound]
    if (!item) return ''
    var itemMatch = this.items[this.hero].items.voicelines.filter(a => a.id == item)
    if (!itemMatch || !itemMatch.length) return ''
    return `\n ${itemMatch[0].name}`
  }

  this.isItemSelected = sound => {
    if (loading) return false
    if (!this.mappedSounds[this.hero]) return false
    return this.mappedSounds[this.hero][sound]
  }

  this.getSoundFiles = () => {
    if (loading) return []
    if (this.showSelectedFiles) {
      if (!this.mappedSounds[this.hero]) return []
      return this.sounds[vm.hero].filter(a => vm.mappedSounds[vm.hero][a.id])
    }
    return this.sounds[vm.hero]
  }

  this.selectNextSound = (keyCode, index) => {
    var num = keyCode == 40 || keyCode == 39 ? 1 : keyCode == 38 || keyCode == 37 ? -1 : undefined
    if (!num) return
    var d = this.getSoundFiles()
    var i = index || vm.sSoundIndex
    var nextItem = i + num > d.length - 1 ? 0 : i + num < 0 ? d.length -1 : i + num
    this.playSound(d[nextItem].id, nextItem)
    setTimeout(() => {
      document.querySelector('#soundList div.selected').scrollIntoViewIfNeeded(true)
    }, 10)
  }

  this.replaySound = () => {
    audio.currentTime = 0
    audio.play()
  }

  var tempSound
  this.playSound = (soundID, index, noSave) => {
    if (!soundID) return
    if ((soundID == this.sSound && !tempSound) || (noSave && tempSound == soundID)) {
      this.replaySound()
      return
    }
    if (noSave) tempSound = soundID
    else {
      tempSound = null
      this.sSound = soundID
      this.sSoundIndex = index
    }
    this.currentURL = `./sounds/${this.hero}/${this.hero}-${soundID}.ogg`
  }

  window.onbeforeunload = () => {
    return 'Are you sure??'
  }

  init()
}])