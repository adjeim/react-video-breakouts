import React, { useEffect, useState } from 'react';
import { connect, Room as VideoRoom } from 'twilio-video';
import './App.css';
import Room from './Room';

export interface VideoRoomListItem {
  _id: string;
  name: string;
  parent: string | null;
}


const App = () => {
  const [identity, setIdentity] = useState('');
  const [room, setRoom] = useState<VideoRoom>();
  const [roomList, setRoomList] = useState<VideoRoomListItem[]>([]);
  const [breakoutRoomList, setBreakoutRoomList] = useState<VideoRoomListItem[]>([]);
  const [showControls, setShowControls] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [parentSid, setParentSid] = useState('');

  // Show or hide the controls when a user checks the checkbox.
  const onCheckboxChange = () => {
    setShowControls(!showControls);
  };

  // List available video rooms when the component first renders
  useEffect(() => {
    listRooms();
  }, []);


  // List all of the available main rooms
  const listRooms = async () => {
    try {
      const response = await fetch('http://localhost:5000/rooms/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      setRoomList(data.rooms);

    } catch (err) {
      console.log(err);
    }
  };

  // Create a new main room
  const createRoom = async () => {
    try {
      const response = await fetch('http://localhost:5000/rooms/main', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomName: newRoomName
        }),
      });

      const data = await response.json();
      setBreakoutRoomList(data.room.breakouts)

      // Once the new room is created, set this input field to be blank
      setNewRoomName('');
      listRooms()

    } catch (err) {
      console.log(err);
    }
  };

  // Create a new breakout room
  const createBreakoutRoom = async () => {
    try {
      const response = await fetch('http://localhost:5000/rooms/breakout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({roomName: newRoomName, parentSid: parentSid}),
      });

      const data = await response.json();
      setBreakoutRoomList(data.room.breakouts)
      setNewRoomName('');

    } catch (err) {
      console.log(err);
    }
  };

  // Get the details about a room from the server
  const getRoom = async (roomSid: string) => {
    try {
      const response = await fetch(`http://localhost:5000/rooms/${roomSid}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!data.room) {
        return console.log(data.message);
      }

      setParentSid(data.room._id);
      setBreakoutRoomList(data.room.breakouts);

    } catch (err) {
      return console.log(err);
    }
  };

   // Join a video room
  const joinRoom = async (roomSid: string, breakout: boolean = false) => {
    try {
      // If you're already in another video room, disconnect from that room first
      if (room) {
        await room.disconnect();
      }

      // If this is a breakout room, get the record for the main room (parent)
      if (breakout) {
        await getRoom(parentSid);
      } else {
        await getRoom(roomSid);
      }

      // Fetch an access token from the server
      const response = await fetch('http://localhost:5000/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identity,
          roomSid
        }),
      });

      const data = await response.json();

      // Connect to the video room
      const videoRoom = await connect(data.accessToken, {
        audio: true,
        video: { width: 640, height: 480 }
      });

      // Save this video room in the state
      setRoom(videoRoom);

    } catch (err) {
      console.log(err);
    }
  };

   // Leave a video room
  const leaveRoom = async () => {
    if (room) {
      // Detach and remove all the tracks
      room.localParticipant.tracks.forEach(publication => {
        if (publication.track.kind === 'audio' || publication.track.kind === 'video') {
          publication.track.stop();
          const attachedElements = publication.track.detach();
          attachedElements.forEach(element => element.remove());
        }
      });

      room.disconnect();
      setRoom(undefined);
    }
  };

  return (
    <div className="app">
      <label className="start">
        <input
          type="checkbox"
          checked={showControls}
          onChange={onCheckboxChange}
          />
        Show Room Controls
      </label>

      {
        showControls &&
          <div className="controls">
            <label className="start">

            Name your room:
            <input
              value={newRoomName}
              onChange={(event) => {
                setNewRoomName(event.target.value);
              }}
              onClick={(event) => {
                event.currentTarget.placeholder = ''
              }}/>
          </label>
          <button
            disabled={newRoomName === '' ? true : false}
            onClick={room ? createBreakoutRoom : createRoom}>
              {room ? 'Create Breakout Room' : 'Create Room'}
          </button>
        </div>
      }
      {
        room === undefined
          ? <div className="start">
              <input
                value={identity}
                onChange={(event) => {
                  setIdentity(event.target.value);
                }}
                onClick={(event) => {
                  event.currentTarget.placeholder = ''
                }}
                placeholder="Enter your name" />
            </div>
          : <Room room={room}
              joinRoom={joinRoom}
              leaveRoom={leaveRoom}
              showControls={showControls}
              breakoutRoomList={breakoutRoomList}
              parentSid={parentSid} />
      }

      <div className='video-rooms-list'>
        { room == null && roomList.length > 0 &&
          <h3>Video Rooms - Click a button to join</h3>
        }
        { room == null &&
          roomList.map((room) => {
            return <button disabled={identity === '' ? true : false}
                          key={room._id}
                          onClick={() => (joinRoom(room._id))}>
                      {room.name}
                    </button>
          })
        }
      </div>
    </div>
  );
};

export default App;